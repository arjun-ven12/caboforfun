# API and real-time protocol

REST JSON is under `/api`. Session auth uses Better Auth's HttpOnly cookie (browser) or the Expo plugin's SecureStore-backed cookie (native). Production configuration requires HTTPS backend, invitation and browser-origin URLs. Native requests send the cookie header with credentials omitted. Never store passwords or snapshots. REST errors are `{error: CODE}` with meaningful HTTP status. Validation errors also include paths. Auth routes are `/api/auth/*` and follow Better Auth's maintained protocol.

| Resource                                | Operations                                                                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------- |
| `/me`, `/profile`                       | GET account; PUT profile with unique lowercase username, displayName and presenceVisible |
| `/users?q=`                             | GET partial username search, up to 20 results, blocked accounts excluded                 |
| `/friends`, `/friends/requests`         | GET edges/profiles; POST request with userId                                             |
| `/friends/requests/:id`                 | POST `{accept: boolean}`                                                                 |
| `/friends/:userId`                      | DELETE relationship/request                                                              |
| `/friends/:userId/block`                | POST block and remove relationship                                                       |
| `/rooms`                                | GET own recent rooms; POST `{rules?: Rules}`                                             |
| `/rooms/join`                           | POST exactly one of `{code}` or `{token}`                                                |
| `/rooms/:id`                            | GET member-authorized room with projected game                                           |
| `/rooms/:id/rules`                      | PUT validated Rules, host and lobby only; resets readiness                               |
| `/rooms/:id/ready`                      | POST `{ready}`; marks explicit rematch acceptance after completion                       |
| `/rooms/:id/start`                      | POST `{rematch?: boolean}`; requires all ready and valid player count                    |
| `/rooms/:id/membership`                 | DELETE outside an active match; transfers host                                           |
| `/rooms/:id/invites`                    | POST `{userId?: string}`; returns one-time plaintext token and HTTPS URL                 |
| `/invites`                              | GET incoming, unexpired lobby invitations                                                |
| `/invites/:id/respond`                  | POST decline/dismiss; accepting is an authorized room join, then dismiss                 |
| `/invites/:id`                          | DELETE revoke, inviter or host only                                                      |
| `/rules`                                | GET built-in and saved presets; POST save with a version                                 |
| `/rules/:id`                            | PUT rename/update with a new version; DELETE user-owned preset                           |
| `/matches`, `/stats`                    | GET own results / aggregate statistics                                                   |
| `/notifications`, `/notifications/read` | GET inbox; POST mark read                                                                |
| `/notifications/token`                  | POST or DELETE `{token}` for current device                                              |

Socket.IO connects to the same host with `auth: {cookie}` over TLS. Authentication runs before connection. Multiple sessions may observe the same account; commands still serialize.

Client events:

- `room:sync(roomId, acknowledgement)`: member-authorized lobby and private game projection.
- `game:command({roomId, actionId, version, command}, acknowledgement)`: UUID action ID and expected monotonic version are required. Retries must reuse the same UUID. A distinct command needs a distinct UUID. Deduplication returns current authorized state. Stale commands fail with `STALE_VERSION`; request synchronization and reselect before submitting a new command.

Command is a discriminated union from `packages/shared/src/engine.ts`:

| Type          | Fields                  | Phase / behavior                                                      |
| ------------- | ----------------------- | --------------------------------------------------------------------- |
| inspect       | indices                 | Memory; exactly the configured number, once                           |
| ready         | —                       | Hide inspected cards; begin after everyone is ready and timer elapsed |
| draw          | source: deck or discard | Start of turn                                                         |
| replace       | indices (1–4)           | Pending draw; validates matching server-side                          |
| discard       | —                       | Deck draw only                                                        |
| activate      | —                       | Deck draw with an enabled ability                                     |
| target        | owner, index, ownIndex? | Own peek, opponent peek, blind swap, Black King inspect               |
| resolveSwap   | ownIndex?               | Black King: omission means Keep as is, otherwise swap                 |
| finishAbility | —                       | Clear private peek; resolve queued bonus before advancing             |
| cabo          | —                       | Configured call phase; initiate one final turn per opponent           |
| nextRound     | —                       | Seat-zero match organizer after round results                         |

Acknowledgements are `{ok:true,data}` or `{ok:false,error}`. Never infer authoritative success solely from local animations. On acknowledgement loss, synchronize before making another selection. Action IDs permit retrying the same logical command; mobile currently synchronizes after timeout rather than automatically retrying.

Server events:

- `room:changed({roomId})`: notification to authenticated members to refresh lobby data.
- `game:state(AuthorizedGameView & {roomId,serverTime})`: individually projected for each account. Ignore versions older than your current state.
- `game:swap({roomId,matchId,event,actor,opponent,serverTime})`: public position-only exchange. `event` contains `id, sequence, version, round, actorId, opponentId, actorIndex, opponentIndex, occurredAt, animateAt`; indices are zero-based. Only newly committed swaps emit this event. Replayed commands return state without another event.
- `profile:updated({userId,displayName,username})`: canonical public identity update for related viewers. Invalidate profile-dependent queries.
- `notification({id,kind,body,roomId?,actor?})`: account-specific inbox update.

There is deliberately one validated game-command event, rather than separate untyped events for each card rank. Public and private data are distinguished by the projection. No socket broadcast contains a deck, all hands, an opponent's pending deck draw, or another viewer's private peek. Failed matches are intentionally public. Completed rounds reveal all hands. Typed client/server event interfaces are in `packages/shared/src/protocol.ts`.

Deadlines use server time and are persisted. The 1-second single-instance scheduler advances expired turns; command validation rejects expired input even before that sweep. Memory never auto-readies players. Timeouts discard pending draws and end the turn; a discard-source timeout returns the taken card to the discard pile. Exhaustion preserves the top discard and reshuffles the rest, or ends the round by the selected policy. No recyclable cards ends the round. Empty hands end the round. Negative scores remain signed integers.

The default extended-absence policy forfeits the match after the configured grace period. The alternative pause policy persists `pausedAt`, rejects player commands while paused, and shifts the stored deadline by the actual pause duration after all absent members reconnect. Both behaviors are integration-tested with a pending private draw.

`AuthorizedGameView` adds `matchId` and current database-backed `identities` to the private engine projection. `swapHistory` contains at most 50 public swaps, retained across rounds and reconnects. Each hand slot has a `revision` that changes on replacement/exchange. Only the acting player receives `activeAbility` and `bonusQueue`; these contain typed ability/origin/depth, never outgoing card identities. Bonus actions use the existing `target`, `resolveSwap` and `finishAbility` commands. A bonus has no `drawn` card; clients must read `activeAbility.ability`. The exchange, queue and history commit atomically. Deadlines bound the whole turn including bonuses.

The immutable snapshot settings are `activateSwappedOutAbilities` (custom default true, classic/legacy false), `chainSwapBonuses` (false), and `maxBonusActions` (1, valid 1–8). The count is the total bonuses per turn, excluding the original drawn action. Declined swaps and ordinary hand replacements do not generate bonuses.
