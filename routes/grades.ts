import express from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/db.js";
import { user } from "../src/db/schema/auth.js";
import {
  classes,
  enrollments,
  gradeItems,
  studentGrades,
} from "../src/db/schema/app.js";
import { requireAuth } from "../src/middleware/auth.js";
import { computeOverallGrade } from "../src/lib/grades.js";

const router = express.Router();

async function getClassRecord(classId: number) {
  const [classRecord] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return classRecord ?? null;
}

async function isEnrolled(studentId: string, classId: number) {
  const [record] = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(
      and(
        eq(enrollments.studentId, studentId),
        eq(enrollments.classId, classId),
      ),
    )
    .limit(1);
  return !!record;
}

async function assertClassAccess(
  req: express.Request,
  classId: number,
  writeAccess = false,
) {
  const classRecord = await getClassRecord(classId);
  if (!classRecord) {
    return { error: { status: 404, message: "Class not found" } };
  }

  const sessionUser = req.user!;
  const isOwner = classRecord.teacherId === sessionUser.id;
  const isAdmin = sessionUser.role === "admin";

  if (writeAccess) {
    if (!isOwner) {
      return { error: { status: 403, message: "Forbidden" } };
    }
    return { classRecord };
  }

  if (isOwner || isAdmin) {
    return { classRecord };
  }

  if (sessionUser.role === "student") {
    const enrolled = await isEnrolled(sessionUser.id, classId);
    if (enrolled) {
      return { classRecord };
    }
  }

  return { error: { status: 403, message: "Forbidden" } };
}

router.get(
  "/classes/:classId/grade-items",
  requireAuth,
  async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      if (isNaN(classId)) {
        return res.status(400).json({ message: "Invalid class ID" });
      }

      const access = await assertClassAccess(req, classId);
      if (access.error) {
        return res
          .status(access.error.status)
          .json({ message: access.error.message });
      }

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
  async (req, res) => {
    try {
      const classId = Number(req.params.classId);
      if (isNaN(classId)) {
        return res.status(400).json({ message: "Invalid class ID" });
      }

      const access = await assertClassAccess(req, classId, true);
      if (access.error) {
        return res
          .status(access.error.status)
          .json({ message: access.error.message });
      }

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

router.get("/classes/:classId/grades", requireAuth, async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const access = await assertClassAccess(req, classId);
    if (access.error) {
      return res
        .status(access.error.status)
        .json({ message: access.error.message });
    }

    const sessionUser = req.user!;
    const classRecord = access.classRecord!;
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
        return res.status(404).json({ message: "Student not enrolled in this class" });
      }
    }

    const items = await db
      .select()
      .from(gradeItems)
      .where(eq(gradeItems.classId, classId))
      .orderBy(gradeItems.createdAt);

    const allGrades = await db
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
      .where(eq(gradeItems.classId, classId));

    let grades = isTeacherView
      ? allGrades
      : allGrades.filter(
          (g) => g.studentId === sessionUser.id && g.published,
        );

    if (studentIdQuery) {
      grades = grades.filter((g) => g.studentId === studentIdQuery);
    }

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
      message:
        error instanceof Error ? error.message : "Failed to fetch grades",
    });
  }
});

router.put("/classes/:classId/grades", requireAuth, async (req, res) => {
  try {
    const classId = Number(req.params.classId);
    if (isNaN(classId)) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const access = await assertClassAccess(req, classId, true);
    if (access.error) {
      return res
        .status(access.error.status)
        .json({ message: access.error.message });
    }

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

    const classItemIds = await db
      .select({ id: gradeItems.id })
      .from(gradeItems)
      .where(eq(gradeItems.classId, classId));

    const validItemIds = new Set(classItemIds.map((i) => i.id));

    for (const update of gradeUpdates) {
      if (!validItemIds.has(update.gradeItemId)) {
        return res.status(400).json({
          message: `Grade item ${update.gradeItemId} does not belong to this class`,
        });
      }

      if (update.score < 0 || update.score > 100) {
        return res
          .status(400)
          .json({ message: "score must be between 0 and 100" });
      }

      const enrolled = await isEnrolled(update.studentId, classId);
      if (!enrolled) {
        return res.status(400).json({
          message: `Student ${update.studentId} is not enrolled in this class`,
        });
      }

      await db
        .insert(studentGrades)
        .values({
          gradeItemId: update.gradeItemId,
          studentId: update.studentId,
          score: String(update.score),
          published: update.published,
        })
        .onConflictDoUpdate({
          target: [studentGrades.gradeItemId, studentGrades.studentId],
          set: {
            score: String(update.score),
            published: update.published,
          },
        });
    }

    return res.status(200).json({ data: { updated: gradeUpdates.length } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to update grades",
    });
  }
});

export default router;
