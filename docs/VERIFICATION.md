# Verification record — 2026-11-11

Local verification completed with Node 22 and PostgreSQL 14. This is the initial local record. A production service has since been deployed; see [current deployment evidence](DEPLOYMENT_STATUS.md).

| Check                                              | Result                                         |
| -------------------------------------------------- | ---------------------------------------------- |
| Fresh `npm ci` from the checked-in lockfile        | Passed                                         |
| Prisma client generation                           | Passed                                         |
| All three SQL migrations against an empty database | Passed                                         |
| TypeScript checks across mobile, server and shared | Passed                                         |
| Production server build                            | Passed                                         |
| Final Vitest run                                   | **61 passed** across three files               |
| Database/HTTP/Socket.IO integration subset         | **9 passed**, with three authenticated clients |
| Android Metro/Hermes export                        | Passed; this is a JS bundle, not an APK        |
| `expo install --check`                             | Dependencies compatible with installed SDK     |
| `npm audit --audit-level=high`                     | Zero known vulnerabilities                     |

The integration suite runs against the compiled `apps/server/dist/index.js`, not a mock transport. It covers anonymous-invite authentication boundary, membership authorization, revocation, friendship duplication and acceptance, challenges, readiness, rule locking, simultaneous commands, action replay, private-state projection, reconnect, rematch, process restart, blocked users, session revocation, disconnect forfeit and pause/resume with a pending draw. Engine tests additionally run 100 simulated rounds and check card-identity conservation.

Reproduce after creating/migrating a dedicated test database:

```bash
npm ci
npm run db:generate
npm run typecheck
npm run build
TEST_DATABASE_URL=postgresql://USER:PASS@HOST/cabo_test TEST_SERVER_ENTRY=apps/server/dist/index.js npm test
npm run export -w @cabo/mobile
(cd apps/mobile && npx expo install --check)
npm audit --audit-level=high
```

External and native checks remain unverified: Railway/Docker deployment, Neon connectivity, actual email and OAuth delivery, APNs/FCM push delivery, signed Android/iOS builds, verified HTTPS OS handoff, installation journeys, physical-device visual/accessibility review and measured frame rate. CI and Maestro configuration are supplied; hosted CI and Maestro were not executed here.

The workspace volume was almost full. Local dependencies were installed in temporary storage with an ignored node_modules symlink; a separate clean installation was also verified. Source and configuration contain no runtime dependency on those temporary paths. Ensure sufficient disk space for a native dependency installation and platform build tools on your development machine.

See [release status](RELEASE_STATUS.md) for remaining product features and operational risks.
