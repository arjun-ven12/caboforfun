# CABO

An Expo / React Native card game with a PostgreSQL-backed, authoritative Node.js multiplayer server. The default preset is **My Custom Cabo**, with the exact requested 54-card deck and suit-aware King powers. This is original generic artwork with no official affiliation.

The client contains working networked flows. The production backend is deployed on Railway with Neon; current Android build/artifact evidence is tracked separately. External services remain configurable. See [release status](docs/RELEASE_STATUS.md) for tested behavior, external dependencies and unfinished release work.

## Requirements

- Node **22.13+** (use Node 22 LTS), npm 10+, PostgreSQL 14+ or Neon.
- Android/iOS simulator or physical device for native runtime verification. SDK 58 uses React Native 0.88 and the New Architecture.
- Docker is optional for local PostgreSQL. EAS and platform developer accounts are required for signed distribution.

Production is now deployed at https://cabo-api-production.up.railway.app. [Download the signed Android preview APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.2.0-preview.1/cabo-android-v1.2.0-preview.apk). See [the production runbook](docs/PRODUCTION_DEPLOYMENT.md) for exact Railway/Neon/EAS settings and [current deployment evidence](docs/DEPLOYMENT_STATUS.md) for build/verification status.

## Local setup

```bash
nvm use
npm ci
cp .env.example .env
cp apps/mobile/.env.example apps/mobile/.env
# Edit .env: database URLs, a random auth secret, backend URL and origins.
# Edit apps/mobile/.env: use your computer's LAN IP for a physical phone.
docker compose up -d db
npm run db:generate
npm run db:migrate
npm run dev:server
```

In another terminal:

```bash
npm run dev:mobile
```

The backend listens on `0.0.0.0:3000`. Android emulator uses `http://10.0.2.2:3000`; a physical device uses `http://YOUR_LAN_IP:3000`. Keep phone and computer on the same network. `localhost` on the phone refers to the phone. Configure `BETTER_AUTH_URL` to the reachable backend URL for OAuth/email callbacks. A native development build is recommended; Expo Go cannot validate your production App Links, Universal Links or remote notifications.

`DATABASE_URL` is the pooled runtime URL; `DIRECT_DATABASE_URL` is the migration URL. Root `.env` is loaded by server development and Prisma scripts. Expo reads its own `apps/mobile/.env`. Only `EXPO_PUBLIC_*` values belong in the mobile environment; they are public bundle contents. Never place credentials there.

Email/password signup and login currently do not require confirmation email, including in production (REQUIRE_EMAIL_VERIFICATION=false). SMTP is optional for that policy; configure it for password reset or set REQUIRE_EMAIL_VERIFICATION=true to require confirmation later. The client exposes password reset and verification requests; these fail honestly if SMTP is not configured.

## Play locally

1. Create accounts on two or more devices. Choose unique usernames in **You** to enable player discovery.
2. Create a private table. Share the invite or enter the six-character room code on another device.
3. Inspect the room rules. Each member taps Ready; the host starts.
4. Each player selects exactly two own cards, inspects them, then taps Ready to hide them. Play begins when everyone is ready and the minimum memory period elapsed.
5. Tap the deck or discard. Select cards and confirm replacement, use a power, or discard an eligible deck draw. Black King reveals an opponent's selected card privately, then offers **Keep as is** or a selected own-card swap.
6. Call Cabo at turn start. Every other player receives one final turn. The server reveals hands and scores the round.
7. For a rematch, each remaining player explicitly accepts; the host starts once all accepted. No new invite is necessary.

Rules lock as a snapshot for the match. Editing a saved preset cannot affect an active match. Room-rule edits in a lobby clear readiness. Quick Match ranks raw hand scores; longer matches accumulate round penalties independently.

## Validation

```bash
npm run typecheck
npm test
npm run build
npm run export -w @cabo/mobile
# Real Postgres + HTTP + three Socket.IO clients; use a separate test database:
TEST_DATABASE_URL=postgresql://cabo:cabo@localhost:5432/cabo_test npm test
```

Create the test database and apply the migrations to it first (with the supplied Docker Compose database):

```bash
docker compose exec db createdb -U cabo cabo_test
export TEST_DATABASE_URL=postgresql://cabo:cabo@localhost:5432/cabo_test
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_DATABASE_URL="$TEST_DATABASE_URL" npm run db:migrate
npm test
```

The integration suite is skipped without `TEST_DATABASE_URL`; it must not run against production. It creates users and rooms. Engine tests include all default powers, private visibility, matching, Cabo final turns, signed scores, custom validation, 2019 preset behavior Best of 3, unlimited match completion, and 100 full round simulations checking identity conservation. See `apps/server/test` for the multi-client harness. Platform E2E instructions are in [mobile QA](docs/MOBILE_QA.md).

## Authentication and email

Better Auth owns passwords, sessions, OAuth state and verification tokens. Its Expo plugin persists cookies through SecureStore. Native API requests and socket handshakes attach that cookie. Private hands stay in memory and never enter persistent client caches. Logout closes sockets, unregisters the device push token and clears query cache.

Set `BETTER_AUTH_SECRET` to at least 32 random characters, for example `openssl rand -hex 32`. Use separate secrets and databases for staging and production. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` to a real sender. Port 465 uses TLS; 587 uses STARTTLS. Configure SPF/DKIM at the sender's domain.

For Google set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; register `https://YOUR_APP_DOMAIN/api/auth/callback/google` with the provider. For Apple set `APPLE_CLIENT_ID` and the signed provider `APPLE_CLIENT_SECRET`; register the corresponding `/api/auth/callback/apple` URL and service ID/domain in Apple Developer. Apple client secrets expire and need rotation. The mobile app uses the browser OAuth flow. Test provider policies and return-to-app behavior on signed builds. Buttons report provider errors when credentials are absent.

## Neon and Railway

1. Create a Neon database, using separate projects or branches per environment. Put the pooled connection string in `DATABASE_URL` and the direct connection string in `DIRECT_DATABASE_URL`, with `sslmode=require`.
2. Create a Railway service from this repository. The root Dockerfile builds only the server/shared workspaces. `.railway/railway.ts` configures migration pre-deployment, one Singapore replica, `/health` and the start command.
3. Set the root `.env.example` variables in Railway. Use production mode, an HTTPS `BETTER_AUTH_URL`, `APP_DOMAIN`, exact browser `ALLOWED_ORIGINS` and a unique auth secret. Railway injects `PORT`.
4. Attach your custom domain and TLS. Invitation landing pages, auth callbacks, association files and Socket.IO share that backend host.
5. Deploy. Pre-deploy runs `npm run db:migrate`; the process starts with `node apps/server/dist/index.js`. Verify `/health` returns 200 only when the database is reachable.
6. Set `EXPO_PUBLIC_API_URL=https://YOUR_APP_DOMAIN` for the mobile build. Socket.IO upgrades to WSS automatically.

CLI alternative after linking a Railway service:

```bash
npm run railway -- up --project 37cac4c3-91ec-4894-aa61-3797ef8c5722 --service 3f809771-e894-4e05-a733-0fa0da2d4724 --environment production --detach
npm run railway -- logs --service cabo-api --environment production --lines 60
```

The production database has all four committed migrations applied, and Railway successfully built and ran the Docker image. Future deployments apply only pending reviewed migrations. The server saves each transition transactionally and recovers snapshots/deadlines after restart. SIGTERM stops the scheduler, closes sockets and drains the database. Use Neon backups and test restores. Never scale replicas above one before implementing shared socket publication and connection ownership.

## Invitations and OS links

Use a real HTTPS domain in both backend `APP_DOMAIN` and mobile `EXPO_PUBLIC_APP_DOMAIN`. A 256-bit invitation token is stored only as SHA-256, expires in 24 hours, can be revoked and exposes no hands. Joining still requires authentication and server checks. The invite landing page accurately reports expired/revoked, cancelled, full and started rooms.

- Android: set `ANDROID_PACKAGE` and comma-separated `ANDROID_SHA256_FINGERPRINTS` using the certificate that actually signs the installed build (Play App Signing differs from an upload key). The server serves `/.well-known/assetlinks.json`; Expo config registers the domain.
- iOS: set `IOS_APP_ID=TEAMID.com.caboforfun.app`. The server serves `/.well-known/apple-app-site-association`; Expo config sets `associatedDomains`.
- Set `IOS_STORE_URL` and `ANDROID_STORE_URL` after listings exist. Empty values intentionally hide installation links.
- Keep association paths unauthenticated, HTTPS, JSON and without redirects. OS caches require reinstall/reverification during testing.
- An installed app retains the token in SecureStore through login/signup and resolves it afterward. **A normal URL does not survive installation automatically.** The landing page supplies the room code and asks the recipient to save it or return to the original link after installation. No third-party deferred-attribution service is pretended to be configured.

## Push notifications

Create/link the EAS project, set `EXPO_PUBLIC_EAS_PROJECT_ID` and configure APNs/FCM credentials with EAS. Enable notifications in Settings; the app requests OS permission and registers the device token. Optional `EXPO_ACCESS_TOKEN` authenticates calls to Expo's push API. Socket.IO carries foreground invitations; sockets disconnect in background and reconnect/sync on foreground. This implementation sends friend requests, challenges, accepted joins, lobby readiness, rematch requests and offline turn reminders. Receipt polling, durable retry and other notification categories remain release work.

## Android and iOS builds

Run EAS from the mobile workspace and configure matching public variables in each EAS environment:

```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init
# Add EXPO_PUBLIC_API_URL, EXPO_PUBLIC_APP_DOMAIN, EXPO_PUBLIC_EAS_PROJECT_ID
# through `eas env:create` or the Expo dashboard for each environment.
npx eas-cli build --profile development --platform android
npx eas-cli@27.7.2 env:exec preview 'npx eas-cli@27.7.2 build --profile preview --platform android'
# Download the preview APK URL from EAS; install on your phone:
adb install -r /path/to/cabo.apk
npx eas-cli@27.7.2 env:exec production 'npx eas-cli@27.7.2 build --profile production --platform android'
npx eas-cli@27.7.2 env:exec production 'npx eas-cli@27.7.2 build --profile production --platform ios'
```

Preview produces an APK; production Android produces an AAB. iOS requires Apple signing. Add store metadata, privacy disclosures and screenshots before submission. No binary or signing credentials are included. The icon and splash are original generated SVG/PNG files in `apps/mobile/assets`; card artwork is native SVG/text.

## Repository

- `packages/shared/src`: rules, presets, engine, private projections, validators and protocol.
- `apps/server/src`: Express, auth, social/room APIs, transactions, sockets, timing and push integration.
- `apps/server/prisma`: relational schema and versioned SQL migrations.
- `apps/mobile/app`: Expo Router screens.
- `apps/mobile/src`: session/network layer, preferences, native components and gameplay interaction.
- [Architecture](docs/ARCHITECTURE.md), [protocol](docs/PROTOCOL.md), [release status](docs/RELEASE_STATUS.md).

Dependency choices were checked against [Expo SDK 58](https://expo.dev/changelog/sdk-58), its `bundledNativeModules.json`, [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo) and [Express integration](https://better-auth.com/docs/integrations/express). Classic Cabo follows the [2019 published rule sheet](https://cdn.1j1ju.com/medias/81/a9/63-cabo-rulebook.pdf); the [publisher page](https://beziergames.com/pages/cabo) describes the face-down expert variant. This app uses generic numbered cards for that preset, never proprietary character artwork. Standard-deck adaptation values are Ace 1, 2–10 face value, all J/Q/K 10, no Jokers, with 7–8 own peek, 9–10 opponent peek, J–Q blind swap; it is not the official numbered game.

Version 1.1 adds real-time private-safe swap feedback, bounded outgoing-card bonus abilities (Custom default ON), and unique readable usernames for existing and new accounts. See [the behavior, changed-file and verification report](docs/SWAP_RELEASE_1.1.md).

## Play versus AI

Home → **Play vs AI** supports 1–4 configurable opponents, five difficulties, personalities, practice, hosted solo controls and mixed multiplayer. See [AI architecture, setup, exact test/benchmark results and limits](docs/BOTS.md). Bots require no external AI key. Offline play is deferred; use a live backend for solo.
