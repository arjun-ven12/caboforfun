const { test } = require("node:test");
const assert = require("node:assert/strict");
const { resolveMobileConfig } = require("./release-config.cjs");
const valid = {
  EAS_BUILD_PROFILE: "preview",
  EXPO_PUBLIC_API_URL: "https://cabo-api-production.up.railway.app",
  EXPO_PUBLIC_APP_DOMAIN: "https://cabo-api-production.up.railway.app",
  EXPO_PUBLIC_EAS_PROJECT_ID: "12345678-1234-1234-1234-123456789abc",
};
test("local development remains possible without external accounts", () =>
  assert.equal(resolveMobileConfig({}).api, "http://localhost:3000"));
test("preview uses the supplied HTTPS backend", () =>
  assert.equal(resolveMobileConfig(valid).api, valid.EXPO_PUBLIC_API_URL));
for (const url of [
  "http://localhost:3000",
  "https://localhost",
  "https://127.0.0.1",
  "https://10.0.0.1",
  "https://example.com",
  "https://api.example.com",
  "https://user:password@cabo.test",
  "https://cabo.test/api",
  "https://cabo.test/?token=secret",
])
  test(`release rejects ${new URL(url).hostname}`, () =>
    assert.throws(() =>
      resolveMobileConfig({ ...valid, EXPO_PUBLIC_API_URL: url }),
    ));
test("missing variables cannot silently build a localhost APK", () =>
  assert.throws(() => resolveMobileConfig({ EAS_BUILD_PROFILE: "preview" })));
test("a real project UUID is required", () =>
  assert.throws(() =>
    resolveMobileConfig({ ...valid, EXPO_PUBLIC_EAS_PROJECT_ID: "" }),
  ));
test("EAS project mismatch is rejected", () =>
  assert.throws(() =>
    resolveMobileConfig({
      ...valid,
      EAS_BUILD_PROJECT_ID: "87654321-1234-1234-1234-123456789abc",
    }),
  ));
