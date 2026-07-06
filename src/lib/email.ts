import { eq } from "drizzle-orm";
import { Resend } from "resend";
import { db } from "../db/db.js";
import { invitations } from "../db/schema/app.js";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not defined");
}

if (!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM is not defined");
}

if (!process.env.FRONTEND_URL) {
  throw new Error("FRONTEND_URL is not defined");
}

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM;
const frontendUrl = process.env.FRONTEND_URL;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const sendPasswordResetEmail = async (to: string, url: string) => {
  const { error } = await resend.emails.send({
    from,
    to,
    subject: "Reset your password",
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${url}">Click here to choose a new password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const sendInviteEmail = async (
  inviteId: number,
  to: string,
  token: string,
  role: "teacher" | "student",
  className?: string,
) => {
  const roleLabel = role === "teacher" ? "teacher" : "student";
  const context = className ? ` for the class "${escapeHtml(className)}"` : "";
  const acceptUrl = `${frontendUrl}/accept-invite?token=${token}`;

  try {
    const { error } = await resend.emails.send({
      from,
      to,
      subject: `You've been invited to join as a ${roleLabel}`,
      html: `
      <p>You've been invited to join Classroom Management App as a ${roleLabel}${context}.</p>
      <p><a href="${acceptUrl}">Click here to accept the invite and set up your account</a></p>
      <p>This invite link will expire in 7 days.</p>
    `,
    });

    if (error) {
      throw new Error(error.message);
    }
  } catch (error) {
    await db.delete(invitations).where(eq(invitations.id, inviteId));
    throw error;
  }
};
