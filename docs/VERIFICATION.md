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

## 1.1 regression verification — 2026-11-12

All **92 tests across four files** pass, including **11 PostgreSQL/HTTP/Socket.IO integration cases**, also executed against the compiled server. All workspaces typecheck, production backend builds, Android Metro/Hermes export and all 14 release guards pass. GitHub clean-install CI additionally passed dependency install, four migrations against a fresh database, tests, Docker build and Android export. A React Native ref declaration exposed by the clean install was corrected using public `ViewInstance` types.

Production Neon migration passed after a private full backup. Three accounts remained; missing profiles were backfilled (one profile before, three after). The deployed API health check and two-client HTTPS/WSS full match passed with every custom power, matching, Cabo scoring, reconnect and rematch. A separate live run seeded its hand only through legitimate random draws, then verified both blind-swap and Black King outgoing bonus actions, private target/reveal, pending-bonus reconnect and next-turn sequencing. See `production-live-multiplayer.json` and `production-live-swap-bonus.json`. No administrative card-injection endpoint exists.

These are backend/build results. Native animation, haptic/accessibility behavior and two physical Android devices remain unverified; use the expanded [acceptance matrix](ANDROID_ACCEPTANCE.md).

## AI 1.2 verification

All **115 tests** pass (100 shared engine/AI, 15 database/HTTP/Socket.IO), including against the compiled backend. The original human multiplayer regression suite remains intact. Five SQL migrations are available; the additive bot migration applied on production after a private backup without changing the three existing users/profiles. [AI benchmark evidence](BOT_BENCHMARK.json) covers 10,150 seeded matches and factual-memory invariants. [Live bot evidence](production-bot-check.json) records ordinary authenticated solo/mixed games, scoring, rematch snapshots, pause/restart, statistic separation and private-view checks. These are programmatic clients, not Android devices. See [complete AI behavior and limits](BOTS.md) and the expanded device matrix.
