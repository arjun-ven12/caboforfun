import express from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { toNodeHandler } from "better-auth/node";
import { ZodError } from "zod";
import pino from "pino";
import { GameError } from "@cabo/shared";
import { auth } from "./auth.js";
import { db } from "./db.js";
import { config, origins } from "./config.js";
import { api, hash } from "./api.js";
import { ServiceError } from "./game-service.js";
export const logger = pino({
  level: config.NODE_ENV === "test" ? "silent" : "info",
  redact: [
    "req.headers.cookie",
    "req.headers.authorization",
    "password",
    "token",
    "state",
  ],
});
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: origins, credentials: true }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 300,
      handler: (_req, res) => res.status(429).json({ error: "RATE_LIMIT" }),
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.all("/api/auth/*splat", toNodeHandler(auth));
  app.use(express.json({ limit: "64kb" }));
  app.get("/client-config", (_req, res) =>
    res.json({
      emailVerificationRequired: config.REQUIRE_EMAIL_VERIFICATION === "true",
      passwordResetAvailable: !!process.env.SMTP_HOST,
      googleSignIn: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      appleSignIn: !!(
        process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
      ),
    }),
  );
  app.get("/health", async (_req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: "ok" });
    } catch {
      res.status(503).json({ status: "unavailable" });
    }
  });
  app.get("/.well-known/assetlinks.json", (_req, res) =>
    res.json([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: process.env.ANDROID_PACKAGE || "com.caboforfun.app",
          sha256_cert_fingerprints: (
            process.env.ANDROID_SHA256_FINGERPRINTS || ""
          )
            .split(",")
            .filter(Boolean),
        },
      },
    ]),
  );
  app.get("/.well-known/apple-app-site-association", (_req, res) =>
    res.json({
      applinks: {
        apps: [],
        details: process.env.IOS_APP_ID
          ? [{ appID: process.env.IOS_APP_ID, paths: ["/join/*"] }]
          : [],
      },
    }),
  );
  app.get("/join/:token", async (req, res) => {
    const token = String(req.params.token);
    if (!/^[\w-]{43}$/.test(token)) {
      res.status(404).send("Invitation not found");
      return;
    }
    const invite = await db.invitation.findUnique({
      where: { tokenHash: hash(token) },
      include: { room: { include: { members: true, bots: true } } },
    });
    const valid = invite && !invite.revoked && invite.expiresAt > new Date();
    let message = "This invitation has expired or was revoked.";
    if (valid) {
      const r = invite.room.rules as { maxPlayers: number };
      message =
        invite.room.status === "cancelled"
          ? "This room was cancelled."
          : invite.room.status !== "lobby"
            ? "This game has already started."
            : invite.room.members.length + invite.room.bots.length >=
                r.maxPlayers
              ? "This room is full."
              : "A seat at the table is waiting for you.";
    }
    const code = valid ? invite.room.code : "";
    res
      .type("html")
      .send(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your CABO invitation</title><link rel="stylesheet" href="/invite.css"><main><p class="brand">C A B O</p><div class="mark">◇</div><h1>Good company.<br>A little mystery.</h1><p>${escape(message)}</p>${valid ? `<a class="button" href="cabo://join/${token}">Open CABO</a><p>Installing for the first time? Save this room code, install the app, then choose Join Game.</p><strong>${escape(code)}</strong><p>The code works while the room is open. Your invitation stays on this page.</p>` : ""}<nav>${process.env.IOS_STORE_URL ? `<a href="${escape(process.env.IOS_STORE_URL)}">Get it for iPhone</a>` : ""} ${process.env.ANDROID_STORE_URL ? `<a href="${escape(process.env.ANDROID_STORE_URL)}">Get it for Android</a>` : ""}</nav><p class="small">An original card game experience. No official affiliation.</p></main></html>`,
      );
  });
  app.get("/invite.css", (_req, res) =>
    res
      .type("css")
      .send(
        "body{margin:0;background:#f5f2eb;color:#242823;font-family:system-ui;text-align:center}main{max-width:420px;margin:8vh auto;padding:24px}.brand{letter-spacing:8px}.mark{font-size:100px;color:#426d5d}h1{font-size:38px;font-weight:500;letter-spacing:-1.5px}p{line-height:1.6;color:#62675e}.button{display:block;background:#315a48;color:white;padding:18px;border-radius:18px;text-decoration:none}strong{font-size:32px;letter-spacing:6px}nav a{display:inline-block;margin:20px;color:#315a48}.small{font-size:12px}",
      ),
  );
  app.use("/api", api);
  app.use((_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ZodError) {
        res.status(400).json({
          error: "INVALID_INPUT",
          issues: err.issues.map((i) => ({
            path: i.path,
            message: i.message,
          })),
        });
        return;
      }
      if (err instanceof ServiceError || err instanceof GameError) {
        res
          .status(err instanceof ServiceError ? err.status : 400)
          .json({ error: err.code });
        return;
      }
      if (
        typeof err === "object" &&
        err &&
        "code" in err &&
        err.code === "P2002"
      ) {
        res.status(409).json({ error: "ALREADY_EXISTS" });
        return;
      }
      logger.error({ err }, "Request failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    },
  );
  return app;
}
