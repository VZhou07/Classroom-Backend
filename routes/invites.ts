import express from "express";
import crypto from "crypto";
import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "../src/db/db.js";
import { classes, invitations, newInvitation } from "../src/db/schema/app.js";
import { user } from "../src/db/schema/auth.js";
import { requireAuth, requireRole } from "../src/middleware/auth.js";
import { sendInviteEmail } from "../src/lib/email.js";

const router = express.Router();

const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

router.get("/", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
    try {
        const { search, page = "1", limit = "10", status } = req.query;
        const currentPage = Math.max(1, parseInt(String(page), 10) || 1);
        const limitPerPage = Math.min(Math.max(1, parseInt(String(limit), 10) || 10), 100);
        const offset = (currentPage - 1) * limitPerPage;

        const filterConditions: SQL[] = [];

        if (req.user!.role === "teacher") {
            filterConditions.push(eq(invitations.invitedById, req.user!.id));
        }

        if (search !== undefined && String(search).length > 0) {
            filterConditions.push(ilike(invitations.email, `%${String(search)}%`));
        }

        if (status !== undefined && String(status).length > 0) {
            filterConditions.push(
                eq(
                    invitations.status,
                    String(status) as "pending" | "accepted" | "expired" | "revoked",
                ),
            );
        }

        const whereClause =
            filterConditions.length > 0 ? and(...filterConditions) : undefined;

        const [countResult] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(invitations)
            .where(whereClause);
        const totalCount = countResult?.count ?? 0;

        const inviteList = await db
            .select({
                id: invitations.id,
                email: invitations.email,
                role: invitations.role,
                status: invitations.status,
                expiresAt: invitations.expiresAt,
                createdAt: invitations.createdAt,
                updatedAt: invitations.updatedAt,
                className: classes.name,
                invitedBy: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                },
            })
            .from(invitations)
            .leftJoin(classes, eq(invitations.classId, classes.id))
            .leftJoin(user, eq(invitations.invitedById, user.id))
            .where(whereClause)
            .orderBy(desc(invitations.createdAt))
            .limit(limitPerPage)
            .offset(offset);

        return res.status(200).json({
            data: inviteList,
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
            message: error instanceof Error ? error.message : "Failed to list invites",
        });
    }
});

router.post("/", requireAuth, requireRole("admin", "teacher"), async (req, res) => {
    try {
        const { email, classId } = req.body as { email?: string; classId?: number };

        if (!email) {
            return res.status(400).json({ message: "email is required" });
        }

        const inviterRole = req.user!.role;
        let role: "teacher" | "student";
        let resolvedClassId: number | null = null;
        let className: string | undefined;

        if (inviterRole === "admin") {
            role = "teacher";
        } else {
            role = "student";

            if (!classId) {
                return res.status(400).json({ message: "classId is required when inviting a student" });
            }

            const [classRecord] = await db
                .select()
                .from(classes)
                .where(and(eq(classes.id, classId), eq(classes.teacherId, req.user!.id)))
                .limit(1);

            if (!classRecord) {
                return res.status(404).json({ message: "Class not found" });
            }

            resolvedClassId = classRecord.id;
            className = classRecord.name;
        }

        const token = crypto.randomBytes(32).toString("hex");
        const inviteData: newInvitation = {
            email,
            role,
            token,
            invitedById: req.user!.id,
            classId: resolvedClassId,
            expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
        };

        const [invite] = await db.insert(invitations).values(inviteData).returning();

        if (!invite) {
            return res.status(500).json({ message: "Failed to create invite" });
        }

        await sendInviteEmail(invite.id, email, token, role, className);

        return res.status(201).json({ data: invite });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: error instanceof Error ? error.message : "Failed to create invite",
        });
    }
});

router.get("/:token", async (req, res) => {
    try {
        const { token } = req.params;

        const [invite] = await db
            .select({
                email: invitations.email,
                role: invitations.role,
                status: invitations.status,
                expiresAt: invitations.expiresAt,
                className: classes.name,
            })
            .from(invitations)
            .leftJoin(classes, eq(invitations.classId, classes.id))
            .where(eq(invitations.token, token))
            .limit(1);

        if (!invite || invite.status !== "pending" || invite.expiresAt < new Date()) {
            return res.status(410).json({ message: "This invite is invalid or has expired" });
        }

        return res.status(200).json({
            data: {
                email: invite.email,
                role: invite.role,
                className: invite.className ?? undefined,
            },
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
