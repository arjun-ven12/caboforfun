import { readFileSync, writeFileSync } from "node:fs";
import { io } from "socket.io-client";
const deployment = JSON.parse(
  readFileSync(new URL("../deploy/production.json", import.meta.url), "utf8"),
);
const base = new URL(process.env.CABO_API_URL || deployment.apiUrl);
if (
  base.protocol !== "https:" ||
  base.username ||
  base.password ||
  base.pathname !== "/"
)
  throw new Error(
    "CABO_API_URL must be an HTTPS origin without credentials or paths.",
  );
const checks = [];
let socket,
  roomId,
  cookie = "";
const check = (name, ok) => {
  checks.push({ name, status: ok ? "passed" : "failed" });
  if (!ok) throw new Error(`Check failed: ${name}`);
};
async function request(path, { body, method, cookie: session } = {}) {
  const response = await fetch(new URL(path, base), {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: {
      "Content-Type": "application/json",
      Origin: "cabo://",
      ...(session ? { Cookie: session } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json();
  return { response, data };
}
function openSocket(session = "") {
  const s = io(base.origin, {
    autoConnect: false,
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    timeout: 10000,
    auth: { cookie: session },
  });
  return new Promise((resolve) => {
    s.once("connect", () => resolve({ socket: s, connected: true }));
    s.once("connect_error", (error) =>
      resolve({ socket: s, connected: false, error: error.message }),
    );
    s.connect();
  });
}
try {
  const health = await request("/health");
  check(
    "HTTPS health and PostgreSQL readiness",
    health.response.status === 200 && health.data.status === "ok",
  );
  const unauth = await request("/api/me");
  check("Unauthenticated REST rejected", unauth.response.status === 401);
  const refused = await openSocket();
  refused.socket.disconnect();
  check(
    "WSS Socket.IO endpoint rejects unauthenticated handshake",
    !refused.connected && refused.error === "UNAUTHENTICATED",
  );
  const links = await request("/.well-known/assetlinks.json");
  const target = links.data.find(
    (x) => x.target?.package_name === deployment.androidPackage,
  )?.target;
  check(
    "Android association endpoint has the correct package",
    links.response.status === 200 && !!target,
  );
  if (deployment.androidSha256Fingerprints?.length)
    check(
      "Android association matches registered APK signing certificate",
      deployment.androidSha256Fingerprints.every((value) =>
        target.sha256_cert_fingerprints?.includes(value),
      ),
    );
  checks.push({
    name: "Android signing fingerprint",
    status: target.sha256_cert_fingerprints?.length
      ? "configured_not_device_verified"
      : "not_configured",
  });
  if (process.env.SMOKE_EMAIL && process.env.SMOKE_PASSWORD) {
    const login = await request("/api/auth/sign-in/email", {
      body: {
        email: process.env.SMOKE_EMAIL,
        password: process.env.SMOKE_PASSWORD,
      },
    });
    check(
      "Email/password sign-in",
      login.response.status === 200 && !!login.data.user?.id,
    );
    cookie = login.response.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; ");
    check("Server-issued session cookie", cookie.length > 0);
    const me = await request("/api/me", { cookie });
    check(
      "Authenticated REST session",
      me.response.status === 200 && me.data.id === login.data.user.id,
    );
    const connection = await openSocket(cookie);
    socket = connection.socket;
    check("Authenticated WSS connection", connection.connected);
    const created = await request("/api/rooms", { cookie, body: {} });
    check(
      "Create private lobby",
      created.response.status === 200 && typeof created.data.id === "string",
    );
    roomId = created.data.id;
    const view = await new Promise((resolve, reject) =>
      socket
        .timeout(10000)
        .emit("room:sync", roomId, (error, ack) =>
          error
            ? reject(new Error("Socket acknowledgement timeout"))
            : resolve(ack),
        ),
    );
    check(
      "Authorized socket acknowledgement and state synchronization",
      view.ok === true &&
        view.data.id === roomId &&
        view.data.game === null &&
        view.data.members.some((m) => m.userId === login.data.user.id),
    );
    await request(`/api/rooms/${roomId}/membership`, {
      cookie,
      method: "DELETE",
    });
    roomId = undefined;
    const logout = await request("/api/auth/sign-out", { cookie, body: {} });
    check("Secure logout", logout.response.status === 200);
    const revoked = await new Promise((resolve, reject) =>
      socket
        .timeout(10000)
        .emit("room:sync", "revoked-session-probe", (error, ack) =>
          error
            ? reject(new Error("Socket acknowledgement timeout"))
            : resolve(ack),
        ),
    );
    check(
      "Open socket rejects revoked session",
      revoked.ok === false && revoked.error === "SESSION_REVOKED",
    );
    cookie = "";
  } else
    checks.push({
      name: "Authenticated session and Socket.IO",
      status: "not_run_missing_SMOKE_EMAIL_and_SMOKE_PASSWORD",
    });
} catch (error) {
  checks.push({
    name: "Run completed",
    status: "failed",
    reason: error instanceof Error ? error.message : "Unexpected failure",
  });
} finally {
  if (roomId && cookie)
    await request(`/api/rooms/${roomId}/membership`, {
      cookie,
      method: "DELETE",
    }).catch(() => {});
  if (cookie)
    await request("/api/auth/sign-out", { cookie, body: {} }).catch(() => {});
  socket?.disconnect();
}
const failed = checks.some((c) => c.status === "failed");
const partial = checks.some((c) => c.status.startsWith("not_"));
const report = {
  checkedAt: new Date().toISOString(),
  apiUrl: base.origin,
  status: failed ? "failed" : partial ? "partial" : "passed",
  checks,
};
console.log(JSON.stringify(report, null, 2));
if (process.env.SMOKE_REPORT_PATH)
  writeFileSync(
    process.env.SMOKE_REPORT_PATH,
    JSON.stringify(report, null, 2) + "\n",
  );
process.exitCode = failed ? 1 : partial ? 2 : 0;
