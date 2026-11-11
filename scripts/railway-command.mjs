import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = JSON.parse(
  readFileSync(path.join(root, "deploy/production.json"), "utf8"),
);
const args = process.argv.slice(2);
if (!args.length)
  throw new Error(
    "Supply a Railway command, for example: npm run railway -- status",
  );
// This workspace can itself be hosted on Railway. Its inherited context must
// never select the workspace host as the application's deployment target.
const env = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !key.startsWith("RAILWAY_") ||
      ["RAILWAY_TOKEN", "RAILWAY_API_TOKEN"].includes(key),
  ),
);
const lookup = spawnSync("which", ["railway"], { env, encoding: "utf8" });
env._ = lookup.status === 0 ? lookup.stdout.trim() : "railway";
if (args[0] === "link") {
  const r = spawnSync(
    "railway",
    [
      "link",
      "--project",
      target.railwayProjectId,
      "--service",
      target.railwayServiceId,
      "--environment",
      target.railwayEnvironment,
      ...args.slice(1),
    ],
    { env, cwd: root, stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}
const status = spawnSync("railway", ["status", "--json"], {
  env,
  cwd: root,
  encoding: "utf8",
});
let current;
try {
  current = JSON.parse(status.stdout);
} catch {}
if (status.status !== 0 || current?.id !== target.railwayProjectId)
  throw new Error(
    "CABO project is not linked. Run npm run railway -- link first. No action was executed.",
  );
const r = spawnSync("railway", args, { env, cwd: root, stdio: "inherit" });
if (r.error)
  throw new Error(
    "Railway CLI could not start. Install/authenticate the CLI first.",
  );
process.exit(r.status ?? 1);
