# Two real Android device acceptance test

Status: **prepared, not executed on devices**. No connected Android device or adb is available in this workspace. Build/artifact status is recorded separately in DEPLOYMENT_STATUS.md. A passing backend smoke test is not a device acceptance result.

## Preconditions

- One successful signed **preview APK**, installed on both devices. Record its EAS build URL, application version/versionCode and signing SHA-256 fingerprint. Both phones must use the same build and backend.
- Backend: `https://cabo-api-production.up.railway.app`. Confirm `/health` returns `{"status":"ok"}` and `npm run verify:live` passes with a dedicated verified QA account.
- Use two controlled email identifiers and passwords, A and B. REQUIRE_EMAIL_VERIFICATION=false is the requested release policy: no confirmation email is required. Do not administratively alter these accounts.
- Configure `ANDROID_SHA256_FINGERPRINTS` with the preview APK's actual signing certificate and redeploy. The signing keystore/password remain in EAS; only the public fingerprint goes to Railway.
- Confirm the app's EAS environment contains the deployed HTTPS URL, the invitation origin and actual project UUID. No localhost, emulator or LAN address may be present in the release configuration.
- Device A: Wi-Fi. Device B: mobile data, then repeat on the same Wi-Fi. This verifies that play does not depend on a developer LAN.
- Install permission: allow installation from the browser/file manager used for this preview APK. A Google Play developer account is not needed for direct APK installation.

## Record evidence

Record date, both phone models/Android versions, EAS build URL, backend deployment ID, test case IDs and Pass/Fail/Blocked. Never record passwords, session cookies, private invite tokens, keystore files or non-QA card reveals. No item starts as Passed.

## Authentication and first invitation

| ID  | Actions                                                                                                                                      | Expected result                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A01 | A signs up with an email and a 12+ character password, then logs out and signs back in without receiving or clicking any confirmation email. | Signup establishes a session and login succeeds immediately. Email remains the account identifier; password authentication is still required.                                                    |
| A02 | Force-stop/reopen A. Logout, log back in. Test password reset only after SMTP is configured; otherwise mark that optional subcase Blocked.   | Session survives restart, logout revokes it, reset really changes credentials when email recovery is enabled. No password is stored in UI state after leaving auth.                              |
| A03 | A sets a unique username/display name. B attempts the same username.                                                                         | Duplicate is rejected; B chooses another username.                                                                                                                                               |
| A04 | A creates a table and shares the HTTPS invitation via WhatsApp/messages. B initially has no account.                                         | Native share sheet includes HTTPS URL. Opening it launches CABO or the web invitation landing page.                                                                                              |
| A05 | B opens the invite, signs up/logs in using B's actual mailbox.                                                                               | B automatically returns to the intended lobby; no second room search is required.                                                                                                                |
| A06 | Repeat with B logged in, then with CABO uninstalled on B. Save the displayed room code, install APK, and use the code or original invite.    | Installed flow opens the room. Installation fallback is explicit; automatic deferred attribution is not claimed.                                                                                 |
| A07 | Use a revoked invite, expired invite, started-room invite and a deliberately full two-player table.                                          | Accurate state; no hidden hand data; no unauthorized membership. Expiry can be tested with a dedicated short-lived QA invite using an administrative fixture, not by changing production clocks. |

Verify Android's association independently when adb is available:

```bash
adb shell pm verify-app-links --re-verify com.caboforfun.app
adb shell pm get-app-links com.caboforfun.app
adb shell am start -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'https://cabo-api-production.up.railway.app/join/QA_TOKEN'
```

The device must report the exact deployed domain as verified. Replace QA_TOKEN locally; never publish it in the test record.

## Friends, lobby and rule locking

| ID  | Actions                                                                                                               | Expected result                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L01 | Search by exact and partial username; send request twice; accept/decline; remove; block/unblock.                      | Correct relationship state; duplicate requests fail; blocked requests/challenges fail.                                                                   |
| L02 | Challenge an online friend; repeat with the app backgrounded and notification permission granted.                     | Foreground invitation and background delivery work; accept joins correct lobby; decline removes invitation. Push is blocked until FCM/EAS is configured. |
| L03 | Inspect My Custom Cabo rules on both phones. Host changes timer, match mode and a card value, then restores default.  | B sees updates; readiness resets on each edit; default deck is 54 cards including two Jokers.                                                            |
| L04 | Save/duplicate/rename/delete a preset and round-trip its shared rules code. Enter impossible player/deck/peek counts. | Persisted valid edits; clear validation errors for impossible rules.                                                                                     |
| L05 | Both ready; host starts. Try editing active-match rules from B and from host.                                         | Match starts only when valid; active snapshot cannot change.                                                                                             |

## Initial peek and exact default powers

Choose two own cards on each phone. Only those identities appear on that phone. Tap Ready and verify they hide. Play must not begin until both are ready and the configured memorization minimum elapsed.

Use the exact default preset for this entire matrix. Secure shuffle is random: record **Not encountered** until a card is actually drawn, and continue rounds as necessary. Do not add a deterministic-deck endpoint or reveal all cards to accelerate testing. Engine automation covers each power deterministically; that does not replace this UI/device matrix.

| ID  | Card / action                                                                                  | Expected result                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| G01 | Draw from deck, select a hand card, cancel/reselect, confirm replacement.                      | Reversible selection; exactly one authoritative replacement and turn advance. Opponent never sees private draw.                                |
| G02 | Take top discard; try to activate its power or discard it again.                               | Only replacement is available; server rejects forged activation/discard.                                                                       |
| G03 | Draw 7, then 8 in later turns; activate each.                                                  | One selected own card is privately inspected. No opponent card is selectable for that action.                                                  |
| G04 | Draw 9, then 10; choose own and opponent cards.                                                | Blind exchange, no reveal to either player.                                                                                                    |
| G05 | Draw J, then Q; select an opponent card.                                                       | Acting phone alone sees selected opponent card; no swap under default rules.                                                                   |
| G06 | Draw black King, select opponent card, choose Keep as is.                                      | Private reveal; both hands unchanged; one turn ends.                                                                                           |
| G07 | Draw another black King, inspect, choose Swap and select own card.                             | Exactly selected cards exchange; other identities remain hidden.                                                                               |
| G08 | Replace with a red King, Ace and Joker when available.                                         | Red King has no power and scores 0; Ace 1; Joker -1. Verify hand totals at reveal.                                                             |
| G09 | Keep a special deck draw instead of activating; discard another without activating.            | Keeping does not trigger power; discard ends turn normally.                                                                                    |
| G10 | Attempt matching 2, 3 and 4 same-rank cards. Also deliberately choose different known ranks.   | Successful match replaces selected cards with one draw. Default failure publicly reveals selected cards, keeps hand, discards draw, ends turn. |
| G11 | Tap rapidly / simultaneously from both devices; repeat a confirm while network is interrupted. | No duplicate draw, replacement, turn or score; stale state resynchronizes.                                                                     |

## Cabo, scoring and rematches

| ID  | Actions                                                                                                                                   | Expected result                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | A calls Cabo at start of turn. B completes one final turn.                                                                                | A draws nothing; exactly one final turn for B; all hands revealed once.                                                                         |
| R02 | Compare every revealed card against the default values. Include red/black Kings and negative Joker totals.                                | Raw totals correct; lowest wins; winner round penalty zero; others receive raw totals. Unsuccessful caller adds 5. Tied lowest caller succeeds. |
| R03 | Compare raw hand total, round penalty and cumulative match totals. Try Quick, Best of 3 and score-threshold settings in separate matches. | Server-derived, signed values; Quick uses raw score; longer modes follow their selected rules.                                                  |
| R04 | A requests rematch; B initially declines/does not accept, then accepts.                                                                   | No automatic new match until all remaining players agree. Same invitation remains useful for the existing table.                                |
| R05 | Start rematch; inspect new cards.                                                                                                         | New match ID/deck/secrets/history, same selected rules, correct previous-match association.                                                     |

## Network and restart recovery

| ID  | Actions                                                                                                                | Expected result                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| N01 | Background B for less than grace; restore it. Toggle airplane mode during a pending draw and during Black King reveal. | Socket closes in background; reconnect restores the correct authorized phase without reshuffle. A cannot take B's turn. |
| N02 | Exceed the default 90-second disconnect grace. Repeat in a separately configured pause-policy match.                   | Default forfeit is explicit. Pause rejects actions and resumes the same pending draw/deadline on reconnect.             |
| N03 | While both QA players consent and have a match active, redeploy/restart only `cabo-api` in Railway.                    | Transient reconnect; same match, hands, rules and turn resume from Neon. Never restart the workspace-hosting service.   |
| N04 | Sign the same account into a second device/session, then logout/revoke one session.                                    | No duplicate turns; revoked connection's commands fail; authorized session still behaves correctly.                     |
| N05 | Finish match, leave table, view history/statistics on both accounts.                                                   | Correct recorded winners/losses, hand averages and rematch relationship; no unfinished round invented for a forfeit.    |

Release acceptance requires every applicable case to pass on both phones, the requested no-confirmation signup policy, correct HTTPS App Links and a recorded APK build URL. Mark blocked/unencountered cases explicitly. Device evidence must be supplied by actual execution; this document does not certify it.
