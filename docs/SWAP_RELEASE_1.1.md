# CABO 1.1 gameplay and identity change record

## Behavior

Every confirmed inter-player swap commits a public position-only event and the new hand positions in the same database transaction. All authenticated participants receive `game:swap` and individually authorized `game:state` messages. Events contain IDs, player IDs, zero-based positions, round/version/sequence and server timestamps; they contain no card IDs, ranks, values or powers. The initiating player's pending bonus is private. Events use a shared animation timestamp 400 ms after commitment; clients estimate server time from synchronization responses. Slow networks display late events immediately. Exact frame synchronization is not promised.

The table draws two card backs across a measured overlay, briefly highlights affected positions, provides personalized compact banners and optional haptics, and retains the last 50 swaps in match state. State updates, acknowledgments and dedicated swap messages share event IDs. A per-account/per-match sequence watermark prevents duplicate feedback, including across app reopen. Reconnect recovers history and pending actions; older history does not replay motion. Native motion, layout, accessibility and haptics still need physical-device verification.

My Custom Cabo enables `activateSwappedOutAbilities`. The server looks up the actual outgoing card in the authoritative hand. Its eligible power becomes an automatic private pending action after the exchange. The original drawn action card is discarded exactly once; the outgoing card stays in its new owner's hand. Only completing that action, an applicable timeout or forfeit advances play. A declined/invalid swap grants nothing. Ordinary draw replacement and matching do not grant outgoing bonuses.

Default chaining is disabled. If enabled, `maxBonusActions` bounds the total bonus actions in a turn, with a schema and engine hard maximum of 8. The original turn deadline applies to all bonuses. Classic presets default OFF. Legacy snapshots and saved presets lacking the fields keep activation OFF; existing matches are never rewritten. New rooms use the new custom default. Hosts can restore My Custom Cabo or explicitly enable the setting before starting.

Changed slots carry revisions so positional knowledge can be invalidated. No client card-knowledge cache keeps old identities visible. Authorized Black King inspection remains private; players may remember and track the inspected physical card through the public exchange positions.

## Username compatibility

An additive SQL migration provisions every missing/invalid profile using the account's existing human-readable name plus a sequential collision suffix. Existing valid usernames are preserved. A database insert trigger covers password and OAuth registrations, including future accounts. A lowercase format constraint and case-insensitive unique index prevent impersonation through casing. Profile edits serialize with provisioning and return `USERNAME_TAKEN` on duplicates.

Game/room/history/invitation/notification payloads resolve identities from current database profiles. `profile:updated` invalidates connected clients' identity-dependent queries. Display names remain primary and @usernames secondary. Deleted users are labeled Former player without inventing a handle. Email/password authentication remains enabled without mandatory email confirmation, as previously requested.

## Changed files

| File | Purpose |
| --- | --- |
| `packages/shared/src/rules.ts` | Validated activation/chaining/cap settings and preset defaults. |
| `packages/shared/src/engine.ts` | Atomic exchange history, slot revisions, private bounded bonus queue and lifecycle cleanup. |
| `packages/shared/src/protocol.ts` | Canonical public identities, authorized game views and typed swap/profile events. |
| `packages/shared/src/swap-bonus.test.ts` | Bonus powers, no-op/decline cases, privacy, restart serialization, chaining bounds, timeouts and final turns. |
| `apps/server/prisma/schema.prisma` | Optional notification actor relation, separate from recipient. |
| `apps/server/prisma/migrations/202611120001_usernames/migration.sql` | Safe username backfill/provisioning, uniqueness/format constraints and actor migration. |
| `apps/server/src/identity.ts` | Database-backed identity projection and update publisher. |
| `apps/server/src/game-service.ts` | Authorized identity-enriched views; fresh committed swap events versus idempotent replay; recovery cleanup and legacy rule normalization. |
| `apps/server/src/index.ts` | Real-time public swaps and scoped profile update delivery. |
| `apps/server/src/api.ts` | Validated profile edits, identity-enriched invites/history/inbox and compatible preset projection. |
| `apps/server/src/notifications.ts` | Persisted actor attribution and current public actor identity. |
| `apps/server/test/integration.test.ts` | Three-client swap delivery/secrecy/replay, pending bonus reconnect/restart, username provisioning/backfill/edit/collision/search. |
| `apps/mobile/src/swap-feedback.tsx` | Measured card-back exchange overlay, highlights, banners, persisted deduplication, identity component and haptics/reduced motion. |
| `apps/mobile/src/table.tsx` | Bonus selection flow, canonical identities, results and recoverable swap history. |
| `apps/mobile/app/room/[id].tsx` | State/event synchronization, server clock estimate, lobby and rematch identities. |
| `apps/mobile/app/(main)/friends.tsx` | Secondary usernames on requests as well as existing friend/search rows. |
| `apps/mobile/app/_layout.tsx` | Refresh identity-dependent queries on profile events; listener cleanup. |
| `apps/mobile/app/activity.tsx` | Usernames on invitation/notification actors and named match-history scores. |
| `apps/mobile/app/rules.tsx` | Advanced activation/chaining controls, cap slider and complete summary. |
| `apps/mobile/app/how-to-play.tsx` | House-rule explanation and bounded chaining. |
| `apps/mobile/app.config.ts` | Application version 1.1.0. |
| `apps/mobile/eas.json` | Automatic preview Android version-code increments. |
| `scripts/verify-swap-bonus-live.mjs` | Separate live default-deck bonus/reconnect/privacy check using legitimate random draws. |
| `docs/PROTOCOL.md`, `docs/ARCHITECTURE.md` | Document new events, queue, identity projection and compatibility. |
| `docs/production-live-multiplayer.json`, `docs/production-live-swap-bonus.json`, `docs/production-live-check.json`, `docs/GITHUB_RELEASE.md` | Public live-check evidence and distribution record. |
| `scripts/live-multiplayer.mjs` | Live private-safe swap delivery, canonical identity and bonus resolution checks. |
| `docs/ANDROID_ACCEPTANCE.md` | Expanded two-device swap/bonus/identity acceptance matrix. |
| `docs/SWAP_RELEASE_1.1.md` | This implementation, verification and changed-file record. |
| `docs/VERIFICATION.md`, `docs/RELEASE_STATUS.md`, `docs/DEPLOYMENT_STATUS.md`, `docs/PRODUCTION_DEPLOYMENT.md`, `README.md` | Updated test/release facts and installation links. |
| `deploy/production.json`, `deploy/android-preview.json` | Public deployment/build/artifact provenance. |

## Verification

Local Node 22/PostgreSQL verification: all **92 Vitest tests** passed, including **11 real PostgreSQL/HTTP/Socket.IO integration tests**; all workspaces typecheck; production backend builds; Android Metro/Hermes export passes; all **14 release configuration guards** pass. The integration suite was also run against the compiled backend. The migration was applied locally, then against production Neon after a private full database backup: three accounts preserved and profiles increased from one to three.

Release build, live deployment and GitHub artifact results are recorded in `DEPLOYMENT_STATUS.md`. A build or backend test does not establish Android-device behavior. No physical devices are connected here; the two-device acceptance matrix remains unexecuted. Push/OAuth/email recovery retain their pre-existing external setup requirements. This release adds no new third-party services or credentials.
