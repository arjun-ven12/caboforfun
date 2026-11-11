import { randomUUID } from "node:crypto";
const base = process.env.TEST_API_URL || "http://localhost:3000";
async function call(path: string, body: unknown, cookie = "") {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
  return {
    data,
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}
const password = "e2e-local-fixture-password";
const suffix = randomUUID();
const host = await call("/api/auth/sign-up/email", {
  name: "Fixture host",
  email: `host-${suffix}@test.cabo`,
  password,
});
const email = `guest-${suffix}@test.cabo`;
await call("/api/auth/sign-up/email", {
  name: "Fixture guest",
  email,
  password,
});
const room = await call("/api/rooms", {}, host.cookie);
const invite = await call(
  `/api/rooms/${room.data.id}/invites`,
  {},
  host.cookie,
);
console.log(
  JSON.stringify(
    {
      EMAIL: email,
      PASSWORD: password,
      INVITE_TOKEN: invite.data.token,
      ROOM_CODE: room.data.code,
    },
    null,
    2,
  ),
);
