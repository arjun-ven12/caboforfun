# CABO deployment status — 2026-11-12

Current preview: **1.1.0**, Android versionCode **3**. [Download APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.1.0-preview.1/cabo-android-v1.1.0-preview.apk) · [GitHub release](https://github.com/arjun-ven12/caboforfun/releases/tag/v1.1.0-preview.1) · [Official EAS build](https://expo.dev/accounts/jishnuava/projects/cabo-for-fun/builds/fd550347-1ca4-44b6-94f5-ff0afb58e2ae).

| Item                     | Verified result                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production backend       | https://cabo-api-production.up.railway.app; successful Railway Docker deployment, Node 22, one Singapore replica.                                                                                          |
| Deployment configuration | `.railway/railway.ts`; health check, migration pre-deploy, correct PORT/binding and shutdown.                                                                                                              |
| Neon                     | TLS runtime/direct connections; all four migrations applied. Full private backup taken before 1.1 migration. Three original accounts preserved; profiles increased from one to three.                      |
| Authentication           | Email/password, REQUIRE_EMAIL_VERIFICATION=false. Real signup/sign-in sessions and authenticated WSS passed.                                                                                               |
| Default-rule multiplayer | Two real programmatic HTTPS/WSS clients: every custom power, both Black King choices, successful/failed matching, locked rules, scoring, reconnect and rematches passed.                                   |
| Swap bonuses             | Separate default-deck live test passed blind-swap and Black King bonuses, private resolution, pending-action reconnect, chain bound and turn advance. Cards were obtained through legitimate random draws. |
| Local suite              | 92 tests, including 11 real database/HTTP/Socket.IO tests, also against compiled backend; no production DB used for fixtures.                                                                              |
| Release guards           | 14 pass. All workspaces typecheck; production backend and Android Hermes export pass.                                                                                                                      |
| GitHub CI                | Clean install, four migrations against fresh PostgreSQL, tests, typechecks, Docker and Android export passed.                                                                                              |
| EAS                      | @jishnuava/cabo-for-fun; production HTTPS backend/domain configured in preview environment; existing remote signing key.                                                                                   |
| APK                      | FINISHED, downloaded and independently verified; same signer as previous preview; version 1.1.0/code 3.                                                                                                    |
| Real Android devices     | **Not run**. No connected device/adb. Native visual, haptic, accessibility and OS-link behavior remain unverified.                                                                                         |

## Verified artifact

- EAS build: `fd550347-1ca4-44b6-94f5-ff0afb58e2ae`.
- Package `com.caboforfun.app`; standalone release, debuggable=false/testOnly=false.
- Size: 100943304 bytes. Minimum API 24, target 36.
- Signing SHA-256: `98:D7:9D:E7:8C:D6:5F:43:70:B2:68:13:69:F2:1C:46:1E:D7:31:82:6A:63:AC:BC:5A:A3:A6:C4:FB:BB:3B:18`; matches live assetlinks configuration.
- File SHA-256: `6903baf468c14c96716e4cf16feac9c4be22a4a81359091fbc783b7c2536a516`.
- Embedded live HTTPS backend URL confirmed; localhost API fallback absent. New bonus UI and persisted feedback deduplication strings present.
- [Machine-readable artifact evidence](../deploy/android-preview.json).

[Full live multiplayer evidence](production-live-multiplayer.json), [separate outgoing bonus evidence](production-live-swap-bonus.json), [final API/auth/socket checks](production-live-check.json). These are programmatic clients, not Android-device results. The default-power run encountered all powers in 40 turns; the separate bonus run exercised both original swap types in 15 turns.

The GitHub release is the primary download. The EAS artifact remains the original build record; its retention is controlled by EAS. APKs and private database backups are not checked into Git.

SMTP, Google/Apple OAuth, FCM/APNs, background push, Play publishing and iOS distribution retain their prior external setup requirements. No sender/provider setup is faked. See [the production runbook](PRODUCTION_DEPLOYMENT.md), [complete 1.1 change report](SWAP_RELEASE_1.1.md) and [two-device acceptance plan](ANDROID_ACCEPTANCE.md).

Final download-link deployment: `110e7ced-e02c-4cc5-b742-6f55f35a6eff` succeeded. Post-release checks confirmed health, authenticated sockets, session revocation and the updated invitation download link. GitHub serves the APK with HTTP 200 and its server-reported SHA-256 matches the independently verified EAS artifact. Both main and release-tag GitHub CI passed. The two temporary QA accounts and their rooms/matches were removed afterward; the three original accounts and their three profiles remain.
