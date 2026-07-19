import express from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/db.js";
import { user } from "../src/db/schema/auth.js";
import { enrollments, gradeItems, studentGrades } from "../src/db/schema/app.js";
import { requireAuth } from "../src/middleware/auth.js";
import {
  assertClassAccess,
  isEnrolled,
  requireClassAccess,
  requireValidClassId,
} from "../src/middleware/classAccess.js";
import { computeOverallGrade } from "../src/lib/grades.js";

const router = express.Router();

router.get(
  "/classes/:classId/grade-items",
  requireAuth,
  requireValidClassId,
  requireClassAccess(),
  async (req, res) => {
    try {
      const classId = req.classId!;

      const items = await db
        .select()
        .from(gradeItems)
        .where(eq(gradeItems.classId, classId))
        .orderBy(gradeItems.createdAt);

      return res.status(200).json({ data: items });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message:
          error instanceof Error ? error.message : "Failed to fetch grade items",
      });
    }
  },
);

router.post(
  "/classes/:classId/grade-items",
  requireAuth,
  requireValidClassId,
  requireClassAccess(true),
  async (req, res) => {
    try {
      const classId = req.classId!;

      const { name, weight } = req.body as {
        name?: string;
        weight?: number;
      };

      if (!name || weight === undefined) {
        return res
          .status(400)
          .json({ message: "name and weight are required" });
      }

      if (weight < 1 || weight > 100) {
        return res
          .status(400)
          .json({ message: "weight must be between 1 and 100" });
      }

      const [item] = await db
        .insert(gradeItems)
        .values({ classId, name, weight })
        .returning();

      return res.status(201).json({ data: item });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message:
          error instanceof Error ? error.message : "Failed to create grade item",
      });
    }
  },
);

router.patch("/grade-items/:id", requireAuth, async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid grade item ID" });
    }

    const [existing] = await db
      .select()
      .from(gradeItems)
      .where(eq(gradeItems.id, itemId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: "Grade item not found" });
    }

    const access = await assertClassAccess(req, existing.classId, true);
    if (access.error) {
      return res
        .status(access.error.status)
        .json({ message: access.error.message });
    }

    const { name, weight } = req.body as {
      name?: string;
      weight?: number;
    };

    const updates: Partial<{ name: string; weight: number }> = {};
    if (name !== undefined) updates.name = name;
    if (weight !== undefined) {
      if (weight < 1 || weight > 100) {
        return res
          .status(400)
          .json({ message: "weight must be between 1 and 100" });
      }
      updates.weight = weight;
    }

    const [updated] = await db
      .update(gradeItems)
      .set(updates)
      .where(eq(gradeItems.id, itemId))
      .returning();

    return res.status(200).json({ data: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to update grade item",
    });
  }
});

router.delete("/grade-items/:id", requireAuth, async (req, res) => {
  try {
    const itemId = Number(req.params.id);
    if (isNaN(itemId)) {
      return res.status(400).json({ message: "Invalid grade item ID" });
    }

    const [existing] = await db
      .select()
      .from(gradeItems)
      .where(eq(gradeItems.id, itemId))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ message: "Grade item not found" });
    }

    const access = await assertClassAccess(req, existing.classId, true);
    if (access.error) {
      return res
        .status(access.error.status)
        .json({ message: access.error.message });
    }

    await db.delete(gradeItems).where(eq(gradeItems.id, itemId));

    return res.status(200).json({ data: { id: itemId } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to delete grade item",
    });
  }
});

router.get(
  "/classes/:classId/grades",
  requireAuth,
  requireValidClassId,
  requireClassAccess(),
  async (req, res) => {
    try {
      const classId = req.classId!;
      const classRecord = req.classRecord!;
      const sessionUser = req.user!;
      const isTeacherView =
        sessionUser.role === "admin" ||
        classRecord.teacherId === sessionUser.id;

      const studentIdQuery = req.query.studentId
        ? String(req.query.studentId)
        : undefined;

      if (studentIdQuery && !isTeacherView) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (studentIdQuery) {
        const enrolled = await isEnrolled(studentIdQuery, classId);
        if (!enrolled) {
          return res
            .status(404)
            .json({ message: "Student not enrolled in this class" });
        }
      }

      const items = await db
        .select()
        .from(gradeItems)
        .where(eq(gradeItems.classId, classId))
        .orderBy(gradeItems.createdAt);

      const gradeConditions = [eq(gradeItems.classId, classId)];
      if (!isTeacherView) {
        gradeConditions.push(eq(studentGrades.studentId, sessionUser.id));
        gradeConditions.push(eq(studentGrades.published, true));
      } else if (studentIdQuery) {
        gradeConditions.push(eq(studentGrades.studentId, studentIdQuery));
      }

      const grades = await db
        .select({
          id: studentGrades.id,
          gradeItemId: studentGrades.gradeItemId,
          studentId: studentGrades.studentId,
          score: studentGrades.score,
          published: studentGrades.published,
          studentName: user.name,
          studentEmail: user.email,
        })
        .from(studentGrades)
        .innerJoin(user, eq(studentGrades.studentId, user.id))
        .innerJoin(gradeItems, eq(studentGrades.gradeItemId, gradeItems.id))
        .where(and(...gradeConditions));

      const overallForEntries = (
        entries: typeof grades,
        includeUnpublished: boolean,
      ) =>
        computeOverallGrade(
          entries.map((g) => {
            const item = items.find((i) => i.id === g.gradeItemId);
            return {
              score: Number(g.score),
              weight: item?.weight ?? 0,
              published: includeUnpublished ? true : g.published,
            };
          }),
        );

      const overallGrade = studentIdQuery
        ? overallForEntries(grades, isTeacherView)
        : !isTeacherView
          ? overallForEntries(grades, false)
          : null;

      return res.status(200).json({
        data: {
          classId,
          className: classRecord.name,
          items,
          grades: grades.map((g) => ({
            id: g.id,
            gradeItemId: g.gradeItemId,
            studentId: g.studentId,
            score: Number(g.score),
            published: g.published,
            student: isTeacherView
              ? { id: g.studentId, name: g.studentName, email: g.studentEmail }
              : undefined,
          })),
          overallGrade,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Failed to fetch grades",
      });
    }
  },
);

router.put(
  "/classes/:classId/grades",
  requireAuth,
  requireValidClassId,
  requireClassAccess(true),
  async (req, res) => {
    try {
      const classId = req.classId!;

      const { grades: gradeUpdates } = req.body as {
        grades?: Array<{
          gradeItemId: number;
          studentId: string;
          score: number;
          published: boolean;
        }>;
      };

      if (!Array.isArray(gradeUpdates) || gradeUpdates.length === 0) {
        return res.status(400).json({ message: "grades array is required" });
      }

      for (const update of gradeUpdates) {
        if (
          update === null ||
          typeof update !== "object" ||
          typeof update.gradeItemId !== "number" ||
          !Number.isFinite(update.gradeItemId) ||
          !Number.isInteger(update.gradeItemId) ||
          typeof update.studentId !== "string" ||
          update.studentId.length === 0 ||
          typeof update.score !== "number" ||
          !Number.isFinite(update.score) ||
          typeof update.published !== "boolean"
        ) {
          return res.status(400).json({
            message:
              "each grade update requires gradeItemId, studentId, score, and published",
          });
        }

        if (update.score < 0 || update.score > 100) {
          return res
            .status(400)
            .json({ message: "score must be between 0 and 100" });
        }
      }

      // Last write wins for duplicate (gradeItemId, studentId) pairs.
      const deduped = new Map<
        string,
        {
          gradeItemId: number;
          studentId: string;
          score: number;
          published: boolean;
        }
      >();
      //safety
      for (const update of gradeUpdates) {
        deduped.set(`${update.gradeItemId}:${update.studentId}`, update);
      }
      const uniqueUpdates = [...deduped.values()];

      const studentIds = [...new Set(uniqueUpdates.map((u) => u.studentId))];

      const [classItemIds, enrolledRows] = await Promise.all([
        db
          .select({ id: gradeItems.id })
          .from(gradeItems)
          .where(eq(gradeItems.classId, classId)),
        db
          .select({ studentId: enrollments.studentId })
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, classId),
              inArray(enrollments.studentId, studentIds),
            ),
          ),
      ]);

      const validItemIds = new Set(classItemIds.map((i) => i.id));
      const enrolledIds = new Set(enrolledRows.map((r) => r.studentId));

      for (const update of uniqueUpdates) {
        if (!validItemIds.has(update.gradeItemId)) {
          return res.status(400).json({
            message: `Grade item ${update.gradeItemId} does not belong to this class`,
          });
        }
        if (!enrolledIds.has(update.studentId)) {
          return res.status(400).json({
            message: `Student ${update.studentId} is not enrolled in this class`,
          });
        }
      }

      const rows = uniqueUpdates.map((update) => ({
        gradeItemId: update.gradeItemId,
        studentId: update.studentId,
        score: String(update.score),
        published: update.published,
      }));

      await db.transaction(async (tx) => {
        await tx
          .insert(studentGrades)
          .values(rows)
          .onConflictDoUpdate({
            target: [studentGrades.gradeItemId, studentGrades.studentId],
            set: {
              score: sql`excluded.score`,
              published: sql`excluded.published`,
            },
          });
      });

      return res.status(200).json({ data: { updated: uniqueUpdates.length } });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Failed to update grades",
      });
    }
  },
);

export default router;
