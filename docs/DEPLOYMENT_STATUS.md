# CABO deployment status — AI 1.2, 2026-11-12

Current signed preview: **1.2.0 / versionCode 5**. [Download APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.2.0-preview.1/cabo-android-v1.2.0-preview.apk) · [Release](https://github.com/arjun-ven12/caboforfun/releases/tag/v1.2.0-preview.1) · [EAS build](https://expo.dev/accounts/jishnuava/projects/cabo-for-fun/builds/9d84db20-7690-4f8e-9f07-3f907f626746).

| Item                     | Verified result                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                  | Railway, https://cabo-api-production.up.railway.app, one Singapore instance, Node 22. Existing health/start/pre-deploy/shutdown configuration retained.                                       |
| Database                 | Neon TLS connections; all five migrations applied. Private full backup before bot migration; original three users/profiles preserved.                                                         |
| Auth                     | Ordinary email/password login, no mandatory confirmation email. Authenticated WSS and private views verified. Bots have no auth accounts.                                                     |
| AI play                  | Live three-bot solo and two-human mixed games, scoring, immutable rematch configurations, pause/resume/restart, practice boundary and statistics separation passed with programmatic clients. |
| Tests                    | 115 pass: 100 shared/AI and 15 real PostgreSQL/HTTP/Socket.IO cases. Production compiled entry tested. Original human regressions retained.                                                   |
| Calibration              | 10,150 seeded completed games; no illegal action, incorrect remembered fact or stuck match detected. Expert/Master strength ordering remains unproven.                                        |
| Builds                   | All workspaces typecheck, production backend builds, Android Hermes export, 14 release guards and clean GitHub CI pass.                                                                       |
| APK                      | FINISHED; downloaded, apksig verified, manifest/version/backend/AI-bundle checks passed; same certificate as previous previews.                                                               |
| Physical Android devices | **Not run.** Native layout, haptics, accessibility, OS App Links and FPS remain unverified.                                                                                                   |
| Offline                  | **Not implemented.** Solo is server-hosted and needs internet/authentication.                                                                                                                 |

## Artifact evidence

- Build `9d84db20-7690-4f8e-9f07-3f907f626746`; package `com.caboforfun.app`; version 1.2.0/code 5.
- 100992476 bytes. Min API 24; target 36. Standalone release; debuggable=false, testOnly=false.
- Signing SHA-256: `98:D7:9D:E7:8C:D6:5F:43:70:B2:68:13:69:F2:1C:46:1E:D7:31:82:6A:63:AC:BC:5A:A3:A6:C4:FB:BB:3B:18`.
- File SHA-256: `e9cfe8060f537fc08850cd769746b8890453bec80e9d26b0a8ae64547247978a`.
- Live HTTPS backend present in embedded bundle; localhost API fallback absent. AI setup/controls/avatars are included.
- [Machine-readable artifact metadata](../deploy/android-preview.json). Mobile source corresponds to commit `1bb2460`; server-only finalizations were independently deployed.

[AI implementation, per-file report and measured results](BOTS.md) · [benchmark JSON](BOT_BENCHMARK.json) · [live bot evidence](production-bot-check.json) · [two-device acceptance](ANDROID_ACCEPTANCE.md). These backend clients are not Android devices.

No new LLM or infrastructure credentials are required. OAuth, SMTP recovery, FCM/APNs, Play publishing and iOS distribution retain their prior external setup requirements. A single backend instance remains the supported topology; production load/soak testing and native review are outstanding. GitHub is the primary APK download; Expo retains original build provenance under its artifact retention policy.

## Final production closeout

- Server source `523d76f` deployed successfully as Railway deployment `6e71aac5-fc00-43c7-87af-2eb950ea180a`.
- [GitHub CI for final server source](https://github.com/arjun-ven12/caboforfun/actions/runs/43172565708) completed successfully.
- At 2026-11-12 07:11 UTC, live HTTPS/PostgreSQL health, authenticated REST and WSS, unauthenticated rejection, room synchronization, logout/session revocation, Android association and current invitation APK target passed. See [sanitized live results](production-live-check.json).
- Removed the two temporary QA accounts, their five rooms and eight bot seats after verification. All three original accounts and profiles remain. Cleanup was constrained to the exact QA identities and rejected rooms containing other human participants.

The APK contains mobile source `1bb2460`. Later commits change server-side AI memory/personality behavior or documentation; they do not require another native binary. The published release remains immutable.
