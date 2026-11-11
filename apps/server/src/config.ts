import { z } from "zod";
export const config = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3000),
    DATABASE_URL: z.string().min(1),
    DIRECT_DATABASE_URL: z.string().min(1),
    REQUIRE_EMAIL_VERIFICATION: z.enum(["true", "false"]).default("false"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    APP_DOMAIN: z.url(),
    ALLOWED_ORIGINS: z.string().default("http://localhost:8081"),
  })
  .superRefine((v, ctx) => {
    if (v.NODE_ENV === "production") {
      for (const key of ["APP_DOMAIN", "BETTER_AUTH_URL"] as const)
        if (new URL(v[key]).protocol !== "https:")
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: "Production URLs must use HTTPS",
          });
      for (const origin of v.ALLOWED_ORIGINS.split(",")) {
        try {
          if (new URL(origin.trim()).protocol !== "https:") throw new Error();
        } catch {
          ctx.addIssue({
            code: "custom",
            path: ["ALLOWED_ORIGINS"],
            message: "Use explicit HTTPS browser origins in production",
          });
        }
      }
    }
  })
  .parse(process.env);
export const origins = config.ALLOWED_ORIGINS.split(",")
  .map((v) => v.trim())
  .filter(Boolean);
