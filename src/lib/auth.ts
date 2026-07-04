import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq, and } from "drizzle-orm";
import { db } from "../db/db.js"; // your drizzle instance
import * as schema from "../db/schema/index.js";
import { sendPasswordResetEmail } from "./email.js";

export const auth = betterAuth({
    secret:process.env.BETTER_AUTH_SECRET,
    trustedOrigins:[process.env.FRONTEND_URL!],
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
                        .where(
                            and(
                                eq(schema.invitations.email, user.email),
                                eq(schema.invitations.status, "pending"),
                            ),
                        )
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
                    const [invite] = await db
                        .select()
                        .from(schema.invitations)
                        .where(
                            and(
                                eq(schema.invitations.email, user.email),
                                eq(schema.invitations.status, "pending"),
                            ),
                        )
                        .limit(1);

                    if (!invite || invite.expiresAt < new Date()) {
                        return;
                    }

                    await db
                        .update(schema.invitations)
                        .set({ status: "accepted" })
                        .where(eq(schema.invitations.id, invite.id));

                    if (invite.classId) {
                        await db
                            .insert(schema.enrollments)
                            .values({
                                studentId: user.id,
                                classId: invite.classId,
                            })
                            .onConflictDoNothing();
                    }
                },
            },
        },
    },
});
