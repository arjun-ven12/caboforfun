# CABO 1.2 — server-hosted AI opponents

The existing React Native/Expo app, authenticated Express/Socket.IO backend, shared rules engine and Neon persistence remain in place. Standard bot play uses no LLM, paid AI service or new API key.

## Playing

Home → **Play vs AI** → choose 1–4 opponents, individual difficulty/personality and a built-in rule preset. **Play now** creates the solo roster atomically and starts the existing initial-peek flow. **Review table & Advanced Rules** opens the normal lobby; its existing rules editor controls custom/saved presets, cards, powers, matching, timers and match length. Player counts obey the chosen preset (official Classic supports fewer players than the custom preset).

Hosts can also use **AI opponents · add or configure** in an existing lobby. Bot seats count toward capacity. Their original geometric avatars, AI label and absent username distinguish them from registered users. Bots cannot sign in, appear in friend search, send requests or impersonate user accounts.

Five starting configurations: Beginner (strategy 1), Casual (3), Intermediate (5), Expert (8), Master (10). Every bot can have a separate configuration. Custom sliders control strategy, remembered-card retention, risk, aggression, Cabo willingness, opponent awareness, probability inference, special-card information value, delay and decision randomness. Named configurations are saved to the authenticated account and can be loaded again. Personalities adjust priorities independently of difficulty. “Apply first bot’s difficulty to all” copies the setup to the other bot slots.

Bot configuration is copied into each match. Edits during play are rejected. Changing bot roster/configuration in a lobby or before a rematch clears human readiness, so participants must accept the new setup. Rematches retain the room and included bots, while creating a fresh deck, secrets, memory and per-match scores. A transferred human host remains the round organizer even when a bot occupies a lower lobby seat.

Solo **Game controls** offer pause/resume, restart, abandonment, Fast Mode and card-motion speed. Pause is stored in the database and shifts the server deadline on resume; the client freezes the clock and uses estimated server time. Restart/abandonment requires confirmation and records a solo loss, preventing restart farming. Finished solo matches can return to the lobby to change rules or difficulty. Manual solo controls reject mixed rooms and cannot pause other humans’ matches. Disconnected humans follow the chosen grace/forfeit-or-pause rules; they are never silently replaced with bots. Pause before leaving a server-hosted solo match for an extended time.

## Fairness and architecture

- `playerView` is the only source of private card observations. `botObservation` explicitly constructs a whitelist rather than spreading a game/snapshot object. It contains public rules/composition, public moves and discards, scores, counts, permitted legal candidates, the bot’s own authorized draw/peek and its legitimate memory. It has no deck order, foreign private draws/peeks, database or scheduler seed.
- `remember` consumes those authorized views. Facts contain a physical card ID, position revision and confidence. Public swaps transfer facts; successful replacements map surviving positions and known discards. Failed custom penalties never become invented facts. Official failed matches correctly retain knowledge of the previously drawn card. A public shuffle counter invalidates discard membership even if the pile size does not increase. Missing observations clear positional facts conservatively. New rounds clear memory.
- Memory reliability covers position facts, past public discards and behavioral hypotheses (the current public top remains visible). It is applied to actual turn transitions, not every socket update or a pause. Forgotten cards become unknown. Behavioral score hypotheses from observed replacements have low confidence and live in separate estimate fields; they never become known identities.
- Public action history contains actor/type, draw source and replacement indices. It contains no drawn identities, ability identities or privately inspected indices. The last 50 actions and swaps are recoverable through authorized state. A match start timestamp plus monotonic per-match versions helps clients reject delayed updates across rematches; stale swap events are not attached to a newer match.
- `legalActions` belongs to the shared engine. It enumerates observable legal candidates, including initial inspection, discard-source restrictions, all powers, optional look-and-swap, matching, Cabo and round transitions. Hidden matching results are still resolved exclusively by `transition`. Large matching/target candidate sets are bounded (first 10 hand positions for multi-card candidates, 4,096 blind-swap candidates); ordinary starting hands are fully covered.
- `decide` receives only `BotObservation`, configuration and an injected PRNG. It ranks score improvements, matching, information, opponent estimates, known exchanges, optional swaps, eligible outgoing bonuses and match context. Remaining-card composition is built with the shared deck factory, subtracting legitimately known locations/discards. Cabo confidence uses bounded sampling without replacement (8/32/96 samples by strategy), with soft behavioral hypotheses. This is a heuristic policy with a posterior Cabo estimate, not an exhaustive game-tree solver or a claim of optimal play.
- All bot actions execute through the same `transition` function as human commands. Custom 7–8 / 9–10 / J–Q / suit-aware Kings and Jokers are never replaced by a bot-specific rank mapping. Advanced card values/powers, Classic rules, negative values, ties and scoring remain engine-owned.
- Swapped-out powers complete before ordinary turn advance. Default one bonus, optional bounded chaining and the hard maximum of eight remain enforced by the active immutable rule snapshot. Declined/invalid swaps produce no bonus. An automatic bonus with no eligible hidden target is skipped safely; manual activation without a target is rejected.
- `RoomBot` is separate from `User`/`RoomMember`. Match participant identities/configurations are snapshotted, so history survives removing/renaming a lobby bot. `GameSnapshot.botState` holds private memory, PRNG and due time; none is serialized through room/API/socket views.
- The controller uses cancellable per-room timers, database row locks, saved due times, persisted PRNG state and deterministic action IDs. Engine state, memory, bonus queue and audit action commit in one transaction. Startup’s periodic recovery sweep wakes pending bot work. Presentation delays use configured pacing with jitter, while Fast Mode shortens pending delays. Initial memorization preparation is short; the rule’s memorization deadline still applies.
- Gameplay states use normal authorized Socket.IO messages; Fast Mode does not generate a REST-refetch storm for every bot step. Swap events, card movement, position highlights, banners and haptics reuse the existing presentation. Bot actors do not receive user push notifications.

## Practice and statistics

Practice is opt-in and restricted to one-human rooms. Suggestions and explanations use only that human’s **current** authorized view; the coach does not recover earlier private peeks from bot memory. Suggestions are advisory and do not execute moves. Round review uses revealed authoritative scores after completion. Mixed-room practice access is rejected.

Matches are classified as `human`, `solo`, or `mixed`. Existing completed games default to `human`. Human-only statistics exclude both bot categories. Solo statistics include wins/losses, win rate, average/best completed-round hand, Cabo calls/successes, longest winning streak ordered by completion time, and results grouped by rule name and participating difficulty. A mixed-difficulty solo match appears in each participating difficulty group; those groups are not mutually exclusive. Abandoned matches count as losses and contribute only actually completed rounds to hand averages. Rematches have distinct IDs; replayed actions do not create duplicate results.

## Verification and measured results

**115 automated tests pass:** 100 shared engine/AI cases and 15 real PostgreSQL/HTTP/Socket.IO integration cases. The backend suite also passes against the compiled production entry point. Coverage includes privacy/equivalent observations, forgetting, actual custom modifiers, positional facts, all special powers, outgoing bonus actions, bounded chaining, presets/custom rules, short decks, multiple match modes, negative values, solo/mixed completion, saved configuration ownership, pause/resume, roster limits, readiness/host transfer, recovery during a bot bonus, rematches and separate statistics. The existing human multiplayer tests remain included.

`BOT_BENCHMARK.json` records **10,150 completed seeded matches**: 1,000 paired seeds per difficulty against Master, both seat orders (10,000 games), plus 150 two-to-five-player compatibility games across the three presets (official player limits respected). Its paired comparisons executed 218,647 decision actions; the complete run, including compatibility games, took about 71.4 seconds on this Node 22 workspace. The harness checks that every remembered card matches its real physical position and every remembered discard is actually in the discard pile. Those checks are test-harness assertions, never inputs to the decision policy. No illegal action, wrong fact or stuck match was detected.

| Tested difficulty vs Master | Win share, ties split | Approximate paired-score 95% interval |
| --------------------------- | --------------------: | ------------------------------------: |
| Beginner                    |                21.52% |                          19.85–23.20% |
| Casual                      |                30.15% |                          28.33–31.97% |
| Intermediate                |                39.27% |                          37.34–41.21% |
| Expert                      |                49.23% |                          47.34–51.11% |
| Master                      |                50.00% |      Paired identical-policy baseline |

Default-rule full-match p95 simulation times were approximately 12.5–14.0 ms, including transitions, memory and invariant checks. These are synthetic local CPU measurements, not Railway load tests or native frame-rate results. The results support differentiated lower presets but **do not establish that Master is stronger than Expert**, optimality, human skill ratings or a universal ordering across custom rules. More calibration against human opponents and varied match formats remains useful.

## Running and deployment

```bash
npm ci
npm run db:generate
npm run db:migrate
npm run typecheck
npm run build
TEST_DATABASE_URL=postgresql://USER:PASS@HOST/cabo_test TEST_SERVER_ENTRY=apps/server/dist/index.js npm test
npm run test:release
npm run export -w @cabo/mobile
BOT_BENCHMARK_GAMES=1000 BOT_BENCHMARK_OUTPUT=/tmp/cabo-bots.json npm run benchmark:bots
```

Never point integration fixtures at production. The additive `202611120002_bots` migration adds bot seats/configurations, match categories, private agent state and audit-round attribution. Existing users, authentication, usernames, human memberships and snapshots are preserved. Back up production first; use `prisma migrate deploy` through `npm run db:migrate`, never reset/db-push. Railway remains one instance with the existing pre-deploy migration/health workflow. No new runtime environment variables, database vendor or LLM credentials are required.

For controlled live verification, supply `SMOKE_EMAIL_1`, `SMOKE_PASSWORD_1`, `SMOKE_EMAIL_2`, `SMOKE_PASSWORD_2` through private environment configuration; run `node scripts/verify-bots-live.mjs`. Optional `CABO_API_URL` selects a different backend and `BOT_LIVE_REPORT` saves sanitized aggregate results. Use dedicated QA accounts; do not publish passwords/cookies or game snapshots. The script uses ordinary authentication and random server draws, never an administrative card-injection endpoint.

Android preview remains an EAS signed APK built with the configured live HTTPS backend. Artifact/deployment evidence is maintained in `DEPLOYMENT_STATUS.md` and `deploy/android-preview.json` once verified. Physical Android layout, haptics, App Links, accessibility and measured frame rate still require actual devices.

## Deliberate limits

Offline play is **not implemented**. The shared engine/AI are platform-neutral, but a safe offline product also needs authentication-independent navigation, saved local matches and trusted, duplicate-safe result syncing. This release provides reliable server-hosted solo first. There is no external LLM dependency.

The policy is bounded and heuristic. It does not solve every endgame or provide a dedicated search for rare official special-score combinations. Pathological custom rules can create intentionally unbounded matches (for example, a zero-score deck in a threshold format); choose a finite round count when appropriate. The simulator reports incompletion at its safety bound rather than pretending such a configuration finished. Unlimited simulation runs explicitly stop after three rounds; real unlimited matches wait for the human organizer.

Background push, OAuth, password-recovery mail and iOS distribution retain their pre-existing external configuration requirements. Native visual validation, long-running production load/soak tests and cross-instance socket distribution remain outstanding. Single-instance operation is the supported deployment.

## Changed files

| File                                                            | Change                                                                                                     |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `.env.example`                                                  | Documents that no AI provider key is required.                                                             |
| `README.md`                                                     | Adds AI entry, setup, verification and offline limits.                                                     |
| `apps/mobile/app.config.ts`                                     | Sets application version 1.2.0.                                                                            |
| `apps/mobile/app/(main)/index.tsx`                              | Prominent Play vs AI entry.                                                                                |
| `apps/mobile/app/(main)/profile.tsx`                            | Separate solo metrics and difficulty/rule breakdowns.                                                      |
| `apps/mobile/app/activity.tsx`                                  | Labels solo/mixed histories and bot identities.                                                            |
| `apps/mobile/app/bots.tsx`                                      | Solo setup and host bot roster/configuration screen.                                                       |
| `apps/mobile/app/room/[id].tsx`                                 | Solo controls, practice, bot management and ordered state/ack handling.                                    |
| `apps/mobile/src/bot-avatar.tsx`                                | Four original bundled geometric AI portraits.                                                              |
| `apps/mobile/src/bot-editor.tsx`                                | Preset/personality selectors, real custom controls and saved setups.                                       |
| `apps/mobile/src/swap-feedback.tsx`                             | AI identities/avatars/banner attribution and configurable swap speed.                                      |
| `apps/mobile/src/table.tsx`                                     | Bot status, turn history, motion speed and correct paused/server clock.                                    |
| `apps/server/prisma/migrations/202611120002_bots/migration.sql` | Additive schema/index migration preserving existing accounts/data.                                         |
| `apps/server/prisma/schema.prisma`                              | Bot seats/presets, match kind/config snapshots and private agent state.                                    |
| `apps/server/src/api.ts`                                        | Atomic solo, roster/config controls, solo lifecycle, safe practice and separate statistics.                |
| `apps/server/src/app.ts`                                        | Counts bot seats on invitation landing.                                                                    |
| `apps/server/src/bot-controller.ts`                             | Cancellable due-time scheduling, atomic validated execution and replay-safe auditing.                      |
| `apps/server/src/bot-state.ts`                                  | Private persisted agent state updated only from authorized observations.                                   |
| `apps/server/src/game-service.ts`                               | Immutable bot snapshots, canonical identities, memory persistence and host-safe turn organization.         |
| `apps/server/src/index.ts`                                      | Bot recovery/wakeup/publication, no bot push recipients and safe stale-event handling.                     |
| `apps/server/test/integration.test.ts`                          | Solo/mixed, configuration ownership, bonus restart, rematches, statistics, readiness and host regressions. |
| `docs/ANDROID_ACCEPTANCE.md`                                    | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/ARCHITECTURE.md`                                          | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/BOTS.md`                                                  | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/BOT_BENCHMARK.json`                                       | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/PROTOCOL.md`                                              | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/RELEASE_STATUS.md`                                        | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/VERIFICATION.md`                                          | Documentation, test evidence or release/deployment provenance.                                             |
| `docs/production-bot-check.json`                                | Documentation, test evidence or release/deployment provenance.                                             |
| `package.json`                                                  | Adds benchmark and live-bot verification commands.                                                         |
| `packages/shared/src/bot-difficulty.ts`                         | Validated five presets, custom parameters, personalities and seeded PRNG.                                  |
| `packages/shared/src/bot-memory.ts`                             | Legitimate physical-card facts, explicit uncertainty, movement and forgetting.                             |
| `packages/shared/src/bot-observation.ts`                        | Explicit privacy whitelist and legal-action boundary.                                                      |
| `packages/shared/src/bot-simulator.ts`                          | Seeded complete-game harness with factual-memory/discard invariants.                                       |
| `packages/shared/src/bot-strategy.ts`                           | Rule-aware expected utility and bounded posterior Cabo confidence.                                         |
| `packages/shared/src/bot.test.ts`                               | Privacy, modifiers, memory, legality, presets, bonus and edge-case unit tests.                             |
| `packages/shared/src/engine.ts`                                 | Observable legal candidates, public moves/counters, positional revisions and no-target ability safety.     |
| `packages/shared/src/index.ts`                                  | Exports reusable AI modules.                                                                               |
| `packages/shared/src/protocol.ts`                               | AI identity metadata and match epoch for ordered synchronization.                                          |
| `scripts/benchmark-bots.ts`                                     | Paired-seat calibration, compatibility and performance report.                                             |
| `scripts/verify-bots-live.mjs`                                  | Controlled real HTTP/WSS solo and mixed-game acceptance.                                                   |
