import { db } from "../src/db/db.js";
import {
  classes,
  enrollments,
  type newClass,
} from "../src/db/schema/app.js";
import express from "express";
import crypto from "crypto";
import { departments } from "../src/db/schema/schema.js";
import { desc, eq, getTableColumns, SQL, sql } from "drizzle-orm";
import { and, or } from "drizzle-orm";
import { ilike } from "drizzle-orm";
import { subjects } from "../src/db/schema/schema.js";
import { user } from "../src/db/schema/auth.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";

function isPgUniqueViolation(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: string }).code === "23505"
    );
}

const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
    try {
        const {
            search,
            page = "1",
            limit = "10",
            teacherId,
            studentId: studentIdQuery,
            includeEnrollmentCount,
        } = req.query;

        const sessionUser = req.user!;
        let studentId = studentIdQuery ? String(studentIdQuery) : undefined;

        if (sessionUser.role === "student") {
            studentId = sessionUser.id;
        } else if (
            studentId &&
            sessionUser.role !== "admin" &&
            studentId !== sessionUser.id
        ) {
            return res.status(403).json({ message: "Forbidden" });
        }

        if (
            teacherId !== undefined &&
            String(teacherId).length > 0 &&
            sessionUser.role === "teacher" &&
            String(teacherId) !== sessionUser.id
        ) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(
            Math.max(1, parseInt(String(limit), 10) || 10),
            100,
        );
        const offset = (currentPage - 1) * limitPerPage;
        const filterConditions: SQL[] = [];
        const withEnrollmentCount = includeEnrollmentCount === "true";

        if (teacherId !== undefined && String(teacherId).length > 0) {
            filterConditions.push(eq(classes.teacherId, String(teacherId)));
        }

        if (studentId) {
            filterConditions.push(eq(enrollments.studentId, studentId));
        }

        const searchTerm =
            typeof search === "string" ? search.trim() : undefined;
        if (searchTerm) {
            const pattern = `%${searchTerm}%`;
            const clause = or(
                ilike(classes.name, pattern),
                ilike(subjects.name, pattern),
                ilike(user.name, pattern),
            );
            if (clause) filterConditions.push(clause);
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const baseFrom = db
            .select({ count: sql<number>`count(*)::int` })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id));

        const countQuery = studentId
            ? baseFrom.innerJoin(
                  enrollments,
                  eq(enrollments.classId, classes.id),
              )
            : baseFrom;

        const countResult = await countQuery.where(whereClause);
        const totalCount = countResult[0]?.count ?? 0;

        const enrollmentCountSelect = withEnrollmentCount
            ? {
                  enrollmentCount: sql<number>`(
                      SELECT count(*)::int FROM enrollments
                      WHERE enrollments.class_id = ${classes.id}
                  )`.as("enrollment_count"),
              }
            : {};

        const listFrom = db
            .select({
                ...getTableColumns(classes),
                ...enrollmentCountSelect,
                subject: { ...getTableColumns(subjects) },
                teacher: { ...getTableColumns(user) },
            })
            .from(classes)
            .leftJoin(subjects, eq(classes.subjectId, subjects.id))
            .leftJoin(user, eq(classes.teacherId, user.id));

        const classListQuery = studentId
            ? listFrom.innerJoin(
                  enrollments,
                  eq(enrollments.classId, classes.id),
              )
            : listFrom;

        const classList = await classListQuery
            .where(whereClause)
            .orderBy(desc(classes.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        return res.status(200).json({
            data: classList,
            pagination: {
                page: currentPage,
                limit: limitPerPage,
                total: totalCount,
                totalPages: Math.ceil(totalCount / limitPerPage),
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Failed to fetch classes",
        });
    }
});

router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
    try {
        const {
            name,
            description,
            subjectId,
            teacherId,
            capacity,
            status,
            bannerUrl,
            bannerCldPubId,
        } = req.body;
        const classData: newClass = {
            name,
            description,
            subjectId,
            teacherId,
            capacity,
            status,
            bannerUrl,
            bannerCldPubId,
            inviteCode: crypto.randomUUID(),
            schedules: [],
        };
        const [createdClass] = await db
            .insert(classes)
            .values(classData)
            .returning();

        if (!createdClass) {
            return res.status(400).json({ message: "Failed to create class" });
        }

        return res.status(200).json({ data: createdClass });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message:
                error instanceof Error ? error.message : "Failed to create class",
        });
    }
});

router.post("/join", requireAuth, requireRole("student"), async (req, res) => {
    try {
        const { inviteCode } = req.body as { inviteCode?: string };

        if (!inviteCode) {
            return res.status(400).json({ message: "inviteCode is required" });
        }

        const [classData] = await db
            .select({ id: classes.id })
            .from(classes)
            .where(eq(classes.inviteCode, inviteCode))
            .limit(1);

        if (!classData) {
            return res.status(404).json({ message: "Invalid invite code" });
        }

        const result = await db.transaction(async (tx) => {
            const [lockedClass] = await tx
                .select()
                .from(classes)
                .where(eq(classes.id, classData.id))
                .for("update")
                .limit(1);

            if (!lockedClass) {
                return { status: 404 as const, message: "Invalid invite code" };
            }

            if (lockedClass.status !== "active") {
                return { status: 409 as const, message: "This class is not active" };
            }

            const [countResult] = await tx
                .select({ count: sql<number>`count(*)::int` })
                .from(enrollments)
                .where(eq(enrollments.classId, lockedClass.id));
            const enrolledCount = countResult?.count ?? 0;

            if (enrolledCount >= lockedClass.capacity) {
                return { status: 409 as const, message: "This class is full" };
            }

            const [enrollment] = await tx
                .insert(enrollments)
                .values({ studentId: req.user!.id, classId: lockedClass.id })
                .returning();

            return { status: 201 as const, enrollment, class: lockedClass };
        });

        if (result.status === 201) {
            return res.status(201).json({
                data: { enrollment: result.enrollment, class: result.class },
            });
        }

        return res.status(result.status).json({ message: result.message });
    } catch (error) {
        if (isPgUniqueViolation(error)) {
            return res.status(409).json({
                message: "You are already enrolled in this class",
            });
        }
        console.error(error);
        return res.status(500).json({
            message:
                error instanceof Error ? error.message : "Failed to join class",
        });
    }
});

router.get("/:id/enrollments", requireAuth, async (req, res) => {
    try {
        const classId = Number(req.params.id);
        if (isNaN(classId)) {
            return res.status(400).json({ message: "Invalid class ID" });
        }

        const [classRecord] = await db
            .select({ id: classes.id, teacherId: classes.teacherId })
            .from(classes)
            .where(eq(classes.id, classId))
            .limit(1);

        if (!classRecord) {
            return res.status(404).json({ message: "Class not found" });
        }

        const sessionUser = req.user!;
        const isOwner = classRecord.teacherId === sessionUser.id;
        const isAdmin = sessionUser.role === "admin";

        if (!isOwner && !isAdmin) {
            return res.status(403).json({ message: "Forbidden" });
        }

        const enrolledStudents = await db
            .select({
                studentId: enrollments.studentId,
                name: user.name,
                email: user.email,
            })
            .from(enrollments)
            .innerJoin(user, eq(enrollments.studentId, user.id))
            .where(eq(enrollments.classId, classId))
            .orderBy(user.name);

        return res.status(200).json({ data: enrolledStudents });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message:
                error instanceof Error
                    ? error.message
                    : "Failed to fetch enrollments",
        });
    }
});

router.get("/:id", requireAuth, async (req, res) => {
    const classId = Number(req.params.id);
    if (isNaN(classId)) {
        return res.status(400).json({ message: "Invalid class ID" });
    }
    const classData = await db
        .select({
            ...getTableColumns(classes),
            subject: { ...getTableColumns(subjects) },
            teacher: {
                id: user.id,
                name: user.name,
                image: user.image,
            },
            department: { ...getTableColumns(departments) },
        })
        .from(classes)
        .leftJoin(subjects, eq(classes.subjectId, subjects.id))
        .leftJoin(user, eq(classes.teacherId, user.id))
        .leftJoin(departments, eq(subjects.departmentId, departments.id))
        .where(eq(classes.id, classId));
    if (!classData || classData.length === 0) {
        return res.status(404).json({ message: "Class not found" });
    }
    return res.status(200).json({ data: classData[0] ?? null });
});

export default router;
