# Mobile verification

No Android emulator, iOS simulator, connected phone or store signing was available for this implementation. Android Metro/Hermes export and TypeScript passed; these do not verify OS integration or visual quality. The Maestro flow is supplied for device execution and has not been run here.

For a local backend in development mode, generate fresh fixture accounts and an invitation:

```bash
TEST_API_URL=http://localhost:3000 npx tsx scripts/create-e2e-fixture.ts
# Supply the printed values to an installed preview/development build:
maestro test -e EMAIL=... -e PASSWORD=... -e INVITE_TOKEN=... apps/mobile/e2e/invite.yaml
```

The app build must use the same reachable backend. iOS Keychain can survive app uninstall/clearState; explicitly sign out before a clean authentication test if needed. A custom scheme exercises intent retention; verified HTTPS links still need separate OS testing with your signed association configuration.

Release device coverage must include:

- Two, three and five players on small and large phones, system text scaling, screen reader labels and light/dark themes.
- New nonfriend invite → authentication → intended lobby, existing-user invite, full/expired/revoked/started room, native share sheet and code fallback after installation.
- Email verification/reset/deletion, Apple/Google return URLs, cold launch/session persistence and revoked sessions.
- All own/opponent card powers. Only the acting viewer sees the private reveal. Black King Keep as is and Swap must be tested independently.
- Correct/wrong rank matching and point matching; negative Joker totals; caller ties; final-turn order; multiple rounds; end-of-match totals and rematch consent.
- Draw in flight while backgrounding, network loss before/after acknowledgement, two devices logged into one account, reconnect inside grace, grace expiry and backend restart.
- Haptic opt-out, system/app reduced motion, no animation-blocked input, table comfort with one thumb and card legibility.
- Android App Links with debug/preview/Play signing certificates; iOS Universal Links on a real device; reinstall and return to original invite.
- APNs/FCM background invitation delivery on physical devices and unregistering the token after sign-out; no background persistent socket.
- Measure frame time and memory on representative devices. No 60 FPS claim has been made.

Do not record packet captures or screenshots containing private card identities in public issue reports. Inspect each player's decrypted test traffic separately to confirm the intended information boundary.
