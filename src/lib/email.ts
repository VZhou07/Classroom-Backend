import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  throw new Error("RESEND_API_KEY is not defined");
}

if (!process.env.EMAIL_FROM) {
  throw new Error("EMAIL_FROM is not defined");
}

const resend = new Resend(process.env.RESEND_API_KEY);
const from = process.env.EMAIL_FROM;

export const sendPasswordResetEmail = async (to: string, url: string) => {
  await resend.emails.send({
    from,
    to,
    subject: "Reset your password",
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${url}">Click here to choose a new password</a></p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
};

export const sendInviteEmail = async (
  to: string,
  url: string,
  role: "teacher" | "student",
  className?: string,
) => {
  const roleLabel = role === "teacher" ? "teacher" : "student";
  const context = className ? ` for the class "${className}"` : "";

  await resend.emails.send({
    from,
    to,
    subject: `You've been invited to join as a ${roleLabel}`,
    html: `
      <p>You've been invited to join Classroom Management App as a ${roleLabel}${context}.</p>
      <p><a href="${url}">Click here to accept the invite and set up your account</a></p>
      <p>This invite link will expire in 7 days.</p>
    `,
  });
};
