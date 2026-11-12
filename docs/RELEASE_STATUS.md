# Implementation and release status

This repository contains a functional native client and authoritative multiplayer backend. It is not yet a certified, published or load-tested production release. Read this document before distribution.

Production deployment and Android distribution have progressed beyond this initial local record. See [current deployment status](DEPLOYMENT_STATUS.md) and [production runbook](PRODUCTION_DEPLOYMENT.md) for current verified facts.

## Implemented and exercised locally

- Default 54-card suit-aware deck and exact requested power mapping, negative Jokers and zero red Kings.
- Pure configurable engine: initial private inspection, readiness, minimum memory period, deck/discard draw restrictions, replacement, matching, bad-match reveal, own/opponent peeks, blind swaps, optional Black King swaps, Cabo final turns, scoring and match modes.
- Numbered 2019 Classic Cabo preset with distinct deck, powers, public discard replacements, failed-match behavior, Kamikaze, caller scoring and once-per-match 100-to-50 reset. Standard-deck adaptation is a separately named preset.
- Persisted snapshots and deadlines, per-room database locks, UUID deduplication, monotonic versions, server-only secure shuffle and private projection.
- REST accounts/profile/social/rooms/rules/history/stats/inbox operations; authenticated Socket.IO commands and state updates.
- Real database integration tests with three authenticated users and real sockets covering invite resolution/revocation, unauthorized reads, duplicate friendship requests, challenges, readiness/rule locks, concurrent actions, replay, reconnect, rematch, process restart, session revocation, forfeit and pause/resume.
- TypeScript checks and production server build. Android Metro/Hermes export. Generated original vector card backs, icon and splash raster assets.
- Dependency audit with the checked-in lockfile: no known advisories at verification time. Overrides patch vulnerable transitive packages; retain regression checks when updating.

## Implemented, requiring service configuration or device validation

- Better Auth email/password sessions, email verification, reset password and deletion. Email verification is currently disabled in production as requested; email/password accounts work without SMTP. Set REQUIRE_EMAIL_VERIFICATION=true and configure SMTP to require confirmation later. Google/Apple need provider credentials and registered callbacks. OAuth provider accounts remain unconfigured.
- Expo SecureStore persistence, OAuth browser return, deep-link intent retention through sign-in, background socket lifecycle, notifications, haptics, Reanimated interactions and SVG cards.
- Universal/App Link files and invitation web fallback. Domain ownership, TLS, iOS Team ID, Android signing certificate fingerprints and store URLs are external setup. Actual OS handoff and installation flows are unverified. The installation fallback is an explicit room code; no automatic cross-install attribution service is integrated.
- Expo push HTTP delivery and opt-in device registration. APNs/FCM, EAS project and actual background delivery are unverified. Push receipt polling, invalid-token cleanup and durable push retries are not implemented.
- Railway Docker configuration and Neon migration workflow. Local PostgreSQL migration/application succeeded; the backend is now deployed on Railway with a successful remote Docker build, and production Neon migrations and HTTPS/WSS tests passed. The Android preview APK is finished, downloaded and independently signature/manifest/backend-URL verified; artifact evidence is in DEPLOYMENT_STATUS.md. No iOS binary was produced.
- Native screens for onboarding/auth/home/friends/inbox/profile/settings/rules/lobby/game/results/rematches. Their native appearance, accessibility, gestures and frame rate have not been reviewed on devices. There is no claim of measured 60 FPS.

## Remaining product and engineering work

- A production release needs device QA on iOS and Android, accessibility/reduced-motion review, E2E execution, load/soak testing, observability dashboards, backup/restore rehearsal and abuse review.
- Card swaps now have position-only real-time events, a measured card-back exchange overlay, highlights, banners and recovered history. Physical-device visual/frame-rate review remains required. Gesture-driven dragging, sound, native rule-editor bottom sheets, celebration animation and bespoke loading/empty-state illustrations remain unimplemented. UI uses tap/confirm.
- Native preferences support themes, reduced motion, haptics and invitation pushes. There is no sound engine or sound preference.
- Achievements are not implemented. Statistics are derived from stored completed matches/rounds rather than a materialized aggregate table.
- Presence is available in the friends response and refreshed with server queries; there is no dedicated instantaneous presence fan-out. Challenges and friend requests use real-time inbox notifications. Accepted joins, lobby readiness, rematch requests and background turn reminders are also wired to the inbox/push integration; device delivery remains unverified.
- Rematch acceptance is persisted in RoomMember and links the next Match to its predecessor; it is not modeled as a separate request-history table. All remaining room members must explicitly accept. A subset can play after others leave the finished table.
- Extended disconnect currently ends the whole match by forfeit after the grace period. Remaining connected members are recorded as winners. Hands are revealed but no ordinary round scores are invented for that unfinished round. A reconnect inside the grace period restores the original snapshot. A host can instead configure pause-on-disconnect; the persisted pending draw and remaining deadline resume on reconnection. Both policies and the grace duration are configurable. Timer/grace values and server policy are explicit in protocol documentation.
- Quick, Best of 3, fixed rounds, score threshold and explicitly finished unlimited matches are implemented. Best of 3 counts round wins, ends after two wins or three rounds, and gives tied round winners a win each. The engine supports 1–4-card replacements and growing hands, up to five players, finite supported decks and typed abilities. New ability implementations require a new typed engine branch. Arbitrary uploaded code/custom abilities are intentionally unsupported. Cabo timing supports turn start or after a deck draw. Unsupported variants are not represented by nonfunctional controls.
- Rule codes are validated JSON shared through the native sheet; there is no hosted preset-share URL resolver. Saved presets can be duplicated, renamed/overwritten, versioned and deleted. Imported rules are validated again on the server.
- There is no automatic deferred-link provider. Save/copy the room code before installation, or return to the original HTTPS invitation afterward. This limitation is made visible on the landing page.
- Single backend replica only. A Redis adapter alone is insufficient for multiple instances: add cross-instance private-state publication and shared connection/presence ownership first. Authenticated membership sweeps and per-room queries need optimization before high concurrency.
- Socket authorization runs at connection and is rechecked against the session on synchronization and commands. Session revocation has not been tested with provider-specific account recovery flows.
- Audit events store action ID, actor, type and version, not a complete deterministic event log; recovery uses authoritative snapshots. Add retention policies and a separate privileged audit interface if required.
- Account deletion removes identity, sessions, social edges, invitations, presets and device tokens; match records retain random user IDs for historical integrity. A formal retention/export policy remains a product/legal decision.

Do not interpret passing local tests as store approval, licensed affiliation, successful external delivery or production certification.

Release 1.1 adds bounded outgoing-card bonus actions, unique profile provisioning/backfill, canonical identities and swap feedback. All 92 automated tests and 14 release guards pass; see [the complete change record](SWAP_RELEASE_1.1.md). Physical-device acceptance remains unexecuted.
