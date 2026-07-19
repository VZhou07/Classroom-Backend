import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../db/db.js";
import { classes, enrollments, type Class } from "../db/schema/app.js";

async function getClassRecord(classId: number): Promise<Class | null> {
  const [classRecord] = await db
    .select()
    .from(classes)
    .where(eq(classes.id, classId))
    .limit(1);
  return classRecord ?? null;
}

export async function isEnrolled(studentId: string, classId: number) {
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

export async function assertClassAccess(
  req: Request,
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

const PG_INT_MIN = -2_147_483_648;
const PG_INT_MAX = 2_147_483_647;

export function requireValidClassId(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const classId = Number(req.params.classId);
  if (
    !Number.isFinite(classId) ||
    !Number.isInteger(classId) ||
    classId < PG_INT_MIN ||
    classId > PG_INT_MAX
  ) {
    return res.status(400).json({ message: "Invalid class ID" });
  }
  req.classId = classId;
  next();
}

export function requireClassAccess(writeAccess = false) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const classId = req.classId;
    if (classId === undefined) {
      return res.status(400).json({ message: "Invalid class ID" });
    }

    const access = await assertClassAccess(req, classId, writeAccess);
    if (access.error) {
      return res
        .status(access.error.status)
        .json({ message: access.error.message });
    }

    req.classRecord = access.classRecord;
    next();
  };
}
