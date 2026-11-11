import { betterAuth, APIError } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { expo } from "@better-auth/expo";
import nodemailer from "nodemailer";
import { db } from "./db.js";
import { config, origins } from "./config.js";
const transport = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_PORT === "465",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});
async function mail(to: string, subject: string, url: string) {
  if (!process.env.SMTP_HOST)
    throw new Error("SMTP is required for verification and password reset");
  await transport.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject,
    text: `${subject}\n\n${url}\n\nIf you did not request this, ignore this email.`,
  });
}
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  trustedOrigins: [...origins, "cabo://"],
  plugins: [expo()],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: config.REQUIRE_EMAIL_VERIFICATION === "true",
    minPasswordLength: 12,
    sendResetPassword: async ({ user, url }) =>
      mail(user.email, "Reset your CABO password", url),
  },
  emailVerification: {
    sendOnSignUp:
      config.REQUIRE_EMAIL_VERIFICATION === "true" && !!process.env.SMTP_HOST,
    sendVerificationEmail: async ({ user, url }) =>
      mail(user.email, "Verify your CABO email", url),
  },
  user: {
    deleteUser: {
      enabled: true,
      ...(process.env.SMTP_HOST
        ? {
            sendDeleteAccountVerification: async ({
              user,
              url,
            }: {
              user: { email: string };
              url: string;
            }) =>
              mail(user.email, "Confirm deletion of your CABO account", url),
          }
        : {}),
      beforeDelete: async (user) => {
        if (
          await db.roomMember.findFirst({
            where: { userId: user.id, room: { status: "playing" } },
          })
        )
          throw new APIError("BAD_REQUEST", {
            message: "Finish your active match before deleting your account.",
          });
        const rooms = await db.room.findMany({ where: { hostId: user.id } });
        for (const room of rooms) {
          const next = await db.roomMember.findFirst({
            where: { roomId: room.id, userId: { not: user.id } },
            orderBy: { seat: "asc" },
          });
          await db.room.update({
            where: { id: room.id },
            data: next
              ? { hostId: next.userId }
              : { hostId: null, status: "cancelled" },
          });
        }
      },
    },
  },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(process.env.APPLE_CLIENT_ID
      ? {
          apple: {
            clientId: process.env.APPLE_CLIENT_ID,
            clientSecret: process.env.APPLE_CLIENT_SECRET!,
          },
        }
      : {}),
  },
  rateLimit: { enabled: true },
});
