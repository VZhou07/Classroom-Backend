import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../db/db.js"; // your drizzle instance
import * as schema from "../db/schema/index.js";
import { sendPasswordResetEmail } from "./email.js";

const pendingInviteMatch = (email: string) =>
    and(
        sql`lower(${schema.invitations.email}) = ${email.toLowerCase()}`,
        eq(schema.invitations.status, "pending"),
    );

const pendingInviteOrder = [
    desc(schema.invitations.createdAt),
    desc(schema.invitations.id),
] as const;

const isProd = process.env.NODE_ENV === "production";

export const auth = betterAuth({
    secret:process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins:[process.env.FRONTEND_URL!],
    // In production the frontend and backend live on different domains, so the
    // session cookie must be cross-site capable (SameSite=None requires Secure/HTTPS).
    // Locally we keep SameSite=Lax over http://localhost so dev still works.
    advanced: {
        defaultCookieAttributes: {
            sameSite: isProd ? "none" : "lax",
            secure: isProd,
        },
    },
    database: drizzleAdapter(db, {
        provider: "pg", // or "mysql", "sqlite"
        schema
    }),
    emailAndPassword:{
        enabled:true,
        sendResetPassword: async ({ user, url }) => {
            await sendPasswordResetEmail(user.email, url);
        },
    },
    socialProviders:{
        google:{
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        },
        github:{
            clientId: process.env.GITHUB_CLIENT_ID!,
            clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        },
    },
    // Allow Google/GitHub to link to an existing email/password user with the same email.
    // Without this, OAuth returns account_not_linked when that email already exists.
    account: {
        accountLinking: {
            enabled: true,
            trustedProviders: ["google", "github"],
        },
    },
    user:{
        additionalFields:{
            role:{
                type:"string",
                required:true,
                defaultValue:"student",
                // Role is never client-settable; it is derived server-side from a
                // pending invite (see databaseHooks below) or defaults to "student".
                input:false
            },
            imageCldPubId:{
                type:"string",
                required:false,
                input:true

            }
        }
    },
    databaseHooks:{
        user:{
            create:{
                before: async (user) => {
                    const [invite] = await db
                        .select()
                        .from(schema.invitations)
                        .where(pendingInviteMatch(user.email))
                        .orderBy(...pendingInviteOrder)
                        .limit(1);

                    if (!invite || invite.expiresAt < new Date()) {
                        return;
                    }

                    return {
                        data: {
                            ...user,
                            role: invite.role,
                        },
                    };
                },
                after: async (user) => {
                    await db.transaction(async (tx) => {
                        const [invite] = await tx
                            .select()
                            .from(schema.invitations)
                            .where(pendingInviteMatch(user.email))
                            .orderBy(...pendingInviteOrder)
                            .for("update")
                            .limit(1);

                        if (!invite || invite.expiresAt < new Date()) {
                            return;
                        }

                        await tx
                            .update(schema.invitations)
                            .set({ status: "accepted" })
                            .where(
                                and(
                                    eq(schema.invitations.id, invite.id),
                                    eq(schema.invitations.status, "pending"),
                                ),
                            );

                        if (invite.classId) {
                            await tx
                                .insert(schema.enrollments)
                                .values({
                                    studentId: user.id,
                                    classId: invite.classId,
                                })
                                .onConflictDoNothing();
                        }
                    });
                },
            },
        },
    },
});
