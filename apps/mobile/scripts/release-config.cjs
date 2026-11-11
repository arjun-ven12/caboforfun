const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicOrigin(value, name) {
  if (!value) throw new Error(`${name} must be set for an installable build.`);
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin.`);
  }
  const host = u.hostname.toLowerCase();
  const local =
    /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      host,
    ) ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal");
  if (
    u.protocol !== "https:" ||
    local ||
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host.includes("your_app_domain") ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw new Error(
      `${name} must be a public HTTPS origin, without credentials, an API path, query or fragment.`,
    );
  return u.origin;
}
function resolveMobileConfig(env = process.env) {
  const release =
    env.CABO_RELEASE_BUILD === "1" ||
    ["preview", "production"].includes(env.EAS_BUILD_PROFILE);
  const api = release
    ? publicOrigin(env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL")
    : env.EXPO_PUBLIC_API_URL || "http://localhost:3000";
  const app = release
    ? publicOrigin(env.EXPO_PUBLIC_APP_DOMAIN, "EXPO_PUBLIC_APP_DOMAIN")
    : env.EXPO_PUBLIC_APP_DOMAIN || "https://example.com";
  const projectId = env.EXPO_PUBLIC_EAS_PROJECT_ID || env.EAS_BUILD_PROJECT_ID;
  if (release && (!projectId || !UUID.test(projectId)))
    throw new Error(
      "Set EXPO_PUBLIC_EAS_PROJECT_ID to the actual EAS project UUID. Run eas init first.",
    );
  if (
    env.EXPO_PUBLIC_EAS_PROJECT_ID &&
    env.EAS_BUILD_PROJECT_ID &&
    env.EXPO_PUBLIC_EAS_PROJECT_ID !== env.EAS_BUILD_PROJECT_ID
  )
    throw new Error(
      "EAS project IDs disagree; select the intended CABO project.",
    );
  return { release, api, app, domain: new URL(app).hostname, projectId };
}
module.exports = { resolveMobileConfig };
