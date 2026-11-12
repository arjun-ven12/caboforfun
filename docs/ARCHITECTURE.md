# CABO architecture

`packages/shared` contains versioned Zod rule definitions, card definitions, commands, pure state transitions, scoring and player-view projection. It has no database, network or UI dependency. Randomness is injected; the server uses Node crypto.randomInt with Fisher–Yates.

`apps/server` owns Better Auth sessions, Prisma/Postgres persistence, room membership, friendship and invitations. Socket.IO is a notification transport; PostgreSQL is the source of truth. Commands lock the room row in a transaction, deduplicate by user/action ID, compare state version, apply a pure transition, save the confidential snapshot and audit event, then emit separately projected state to each authenticated account. Secrets never go into a shared Socket.IO room broadcast. A reconnect requests the persisted snapshot. One process is the supported initial topology; Redis adapter plus cross-node publication is needed before scaling replicas.

`apps/mobile` uses Expo Router, SecureStore-backed Better Auth, TanStack Query, and transient Zustand preferences. Card selections are local and reversible. Confirming sends commands; only the server computes outcomes. Native invitations preserve tokens through authentication. Installation fallback uses a copyable token/manual code; ordinary universal links cannot carry state through an App Store installation.

Immutable room rule snapshots are copied into each match. New rounds get new decks, hand slots and private-reveal state. Match totals are distinct from hand totals. Timing decisions use persisted deadlines, including after a restart. No client supplies random values, card identity or score.

Verification layers: pure rules tests; Postgres-backed API/socket tests when TEST_DATABASE_URL is configured; Metro exports and TypeScript checks; physical-device and distribution checks remain a release gate.

Swap exchanges and the pending private bonus queue are part of the same confidential snapshot transaction. A public position-only event ring supports reconnects; actor identities are resolved from current database profiles when projecting state. The username provisioning trigger fills legacy profiles and new accounts with unique readable handles. See [the 1.1 change record](SWAP_RELEASE_1.1.md) for bounds, compatibility and file-level details.

AI seats are `RoomBot` records, never authentication accounts. Shared `legalActions`, observation, memory and strategy modules feed a server controller that saves private agent state with each authoritative transition. Match kind/configuration snapshots keep solo/mixed statistics separate from human-only records. See [AI architecture and boundaries](BOTS.md).
