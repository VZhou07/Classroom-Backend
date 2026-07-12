import express from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../src/db/db.js";
import { user } from "../src/db/schema/auth.js";
import {
  classes,
  enrollments,
  gradeItems,
  invitations,
  studentGrades,
} from "../src/db/schema/app.js";
import { subjects } from "../src/db/schema/schema.js";
import { requireAuth } from "../src/middleware/auth.js";
import { computeOverallGrade } from "../src/lib/grades.js";

const router = express.Router();

async function getStudentGradesSummary(studentId: string) {
  const enrolledClasses = await db
    .select({
      classId: classes.id,
      className: classes.name,
    })
    .from(enrollments)
    .innerJoin(classes, eq(enrollments.classId, classes.id))
    .where(eq(enrollments.studentId, studentId));

  if (enrolledClasses.length === 0) return [];

  const classIds = enrolledClasses.map((c) => c.classId);

  const items = await db
    .select()
    .from(gradeItems)
    .where(inArray(gradeItems.classId, classIds));

  const itemIds = items.map((i) => i.id);
  if (itemIds.length === 0) {
    return enrolledClasses.map((c) => ({
      classId: c.classId,
      className: c.className,
      overallGrade: null as number | null,
    }));
  }

  const grades = await db
    .select()
    .from(studentGrades)
    .where(
      and(
        eq(studentGrades.studentId, studentId),
        inArray(studentGrades.gradeItemId, itemIds),
      ),
    );

  const itemsByClass = new Map<number, typeof items>();
  for (const item of items) {
    const list = itemsByClass.get(item.classId) ?? [];
    list.push(item);
    itemsByClass.set(item.classId, list);
  }

  const gradesByItem = new Map<number, (typeof grades)[0]>();
  for (const grade of grades) {
    gradesByItem.set(grade.gradeItemId, grade);
  }

  return enrolledClasses.map((c) => {
    const classItems = itemsByClass.get(c.classId) ?? [];
    const entries = classItems
      .map((item) => {
        const grade = gradesByItem.get(item.id);
        if (!grade) return null;
        return {
          score: Number(grade.score),
          weight: item.weight,
          published: grade.published,
        };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return {
      classId: c.classId,
      className: c.className,
      overallGrade: computeOverallGrade(entries),
    };
  });
}

router.get("/summary", requireAuth, async (req, res) => {
  try {
    const sessionUser = req.user!;

    if (sessionUser.role === "student") {
      const [enrolledCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(enrollments)
        .where(eq(enrollments.studentId, sessionUser.id));

      const gradesSummary = await getStudentGradesSummary(sessionUser.id);

      return res.status(200).json({
        data: {
          enrolledClassCount: enrolledCountResult?.count ?? 0,
          gradesSummary,
        },
      });
    }

    if (sessionUser.role === "teacher") {
      const [classCountResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(classes)
        .where(eq(classes.teacherId, sessionUser.id));

      const teacherClassIds = await db
        .select({ id: classes.id })
        .from(classes)
        .where(eq(classes.teacherId, sessionUser.id));

      let totalStudents = 0;
      if (teacherClassIds.length > 0) {
        const [studentsResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(enrollments)
          .where(
            inArray(
              enrollments.classId,
              teacherClassIds.map((c) => c.id),
            ),
          );
        totalStudents = studentsResult?.count ?? 0;
      }

      const [pendingInviteResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(invitations)
        .where(
          and(
            eq(invitations.invitedById, sessionUser.id),
            eq(invitations.status, "pending"),
          ),
        );

      return res.status(200).json({
        data: {
          classCount: classCountResult?.count ?? 0,
          totalStudents,
          pendingInviteCount: pendingInviteResult?.count ?? 0,
        },
      });
    }

    // admin
    const [studentCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.role, "student"));
    const [teacherCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.role, "teacher"));
    const [adminCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(user)
      .where(eq(user.role, "admin"));
    const [classCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(classes);
    const [subjectCountResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subjects);
    const [pendingInviteResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(invitations)
      .where(eq(invitations.status, "pending"));

    return res.status(200).json({
      data: {
        userCounts: {
          student: studentCount?.count ?? 0,
          teacher: teacherCount?.count ?? 0,
          admin: adminCount?.count ?? 0,
        },
        classCount: classCountResult?.count ?? 0,
        subjectCount: subjectCountResult?.count ?? 0,
        pendingInviteCount: pendingInviteResult?.count ?? 0,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message:
        error instanceof Error ? error.message : "Failed to fetch dashboard summary",
    });
  }
});

export default router;
