# CABO production deployment and Android installation

This runbook targets the existing TypeScript monorepo. Backend source is deployed from the **repository root**; EAS commands run in **apps/mobile**. Do not change Railway's build root to apps/server or EAS's archive root to apps/mobile: shared/workspace files must remain present.

## Current resources

| Resource                      | Value                                                  |
| ----------------------------- | ------------------------------------------------------ |
| Railway project               | cabo-production · 37cac4c3-91ec-4894-aa61-3797ef8c5722 |
| Railway service               | cabo-api · 3f809771-e894-4e05-a733-0fa0da2d4724        |
| Railway environment           | production                                             |
| Region / replicas             | Singapore / exactly one                                |
| Backend and invitation origin | https://cabo-api-production.up.railway.app             |
| Health                        | https://cabo-api-production.up.railway.app/health      |
| Expo project                  | @jishnuava/cabo-for-fun                                |
| EAS project UUID              | 4647123c-0e97-4b96-8598-34d6c470bd3c                   |
| Android package               | com.caboforfun.app                                     |

Public identifiers are also in deploy/production.json. Secrets are **not** there. The Neon connection supplied for this project was configured privately in Railway; no password or auth secret is committed. Do not print `railway variable list --json`, keystore downloads, `.env` files or EAS tokens in shared logs.

## Where every variable belongs

### Railway → cabo-production → production → cabo-api → Variables

| Variable                               | Requirement / value                                                                                                                                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NODE_ENV                               | Required: production                                                                                                                                                                                                        |
| PORT                                   | 3000, matching the service domain's target port; server binds 0.0.0.0                                                                                                                                                       |
| DATABASE_URL                           | Required secret: Neon **pooled** PostgreSQL URI, with sslmode=require and the supplied channel_binding parameter                                                                                                            |
| DIRECT_DATABASE_URL                    | Required secret: same Neon database/user/password, **direct** hostname without `-pooler`; used by Prisma Migrate                                                                                                            |
| BETTER_AUTH_SECRET                     | Required secret: stable random 32+ character value. Already generated/configured. Do not rotate casually; existing sessions depend on it.                                                                                   |
| BETTER_AUTH_URL                        | Required: https://cabo-api-production.up.railway.app                                                                                                                                                                        |
| APP_DOMAIN                             | Required invitation origin: https://cabo-api-production.up.railway.app                                                                                                                                                      |
| ALLOWED_ORIGINS                        | Required exact browser origin(s), comma separated. Current value is the HTTPS backend origin. Native cabo:// is trusted separately. No wildcard.                                                                            |
| REQUIRE_EMAIL_VERIFICATION             | Current user-requested policy: **false**. Email remains the account identifier, with a password. Signup establishes a session without a confirmation email. Set true only when SMTP is configured and you want that policy. |
| ANDROID_PACKAGE                        | com.caboforfun.app                                                                                                                                                                                                          |
| ANDROID_SHA256_FINGERPRINTS            | Required for verified App Links: actual preview/release signing certificate SHA-256, comma separated if multiple. Not a password. Must match the certificate on the installed APK.                                          |
| ANDROID_STORE_URL                      | Optional: official APK/build installation URL for direct preview distribution, or Play listing once published. Landing page hides install action while unset.                                                               |
| SMTP_HOST                              | Optional for current no-verification policy; required for password reset or future email verification/deletion by email. Use a real sender.                                                                                 |
| SMTP_PORT                              | 587 for STARTTLS, or 465 for implicit TLS                                                                                                                                                                                   |
| SMTP_USER, SMTP_PASS                   | Optional sender credentials; secret values only in Railway                                                                                                                                                                  |
| MAIL_FROM                              | Verified sender address, e.g. CABO <hello@your-domain>. Required when email is enabled.                                                                                                                                     |
| GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET | Optional Google OAuth pair. Callback: https://cabo-api-production.up.railway.app/api/auth/callback/google                                                                                                                   |
| APPLE_CLIENT_ID, APPLE_CLIENT_SECRET   | Optional Apple web OAuth pair. Callback: https://cabo-api-production.up.railway.app/api/auth/callback/apple. Secret is a signed, expiring Apple client secret.                                                              |
| IOS_APP_ID                             | Optional until iOS: TEAMID.com.caboforfun.app for AASA                                                                                                                                                                      |
| IOS_STORE_URL                          | Optional until an iOS store listing exists                                                                                                                                                                                  |
| EXPO_ACCESS_TOKEN                      | Optional Expo push access token when push API authentication is enabled. Backend only. Never an EXPO_PUBLIC variable.                                                                                                       |

The public `/client-config` endpoint reports only which account options are enabled. The mobile login shows configured options, so unconfigured Google/Apple, reset and verification actions do not appear. No provider secrets are returned.

### Neon console

No app environment variables are entered into Neon. Select the production project/branch/database/role and copy **both** pooled and direct connection strings into the two Railway variables above. Keep TLS enabled. The direct hostname was derived from the supplied pooled hostname and independently tested before migration.

The production public schema was empty before initialization. A private schema backup was taken; all three committed migrations were applied with `prisma migrate deploy`. No `db push`, reset, force or development migration command was used. Subsequent deployments run `npm run db:migrate` before starting and should report no pending migrations unless reviewed SQL was added. For future changes to existing data, create a Neon branch/restore point or backup before applying; do not test destructive migrations on production. Do not run the local integration suite with production DATABASE_URL/TEST_DATABASE_URL.

### Expo → @jishnuava/cabo-for-fun → Project settings → Environment variables

Configure these as **Plain text**, project-scoped, in both **preview** and **production**. They are public and will be in the app/configuration:

| Name                       | Current value                              |
| -------------------------- | ------------------------------------------ |
| EXPO_PUBLIC_API_URL        | https://cabo-api-production.up.railway.app |
| EXPO_PUBLIC_APP_DOMAIN     | https://cabo-api-production.up.railway.app |
| EXPO_PUBLIC_EAS_PROJECT_ID | 4647123c-0e97-4b96-8598-34d6c470bd3c       |
| EXPO_OWNER                 | jishnuava                                  |

These are already set for this deployment. `apps/mobile/.env.preview.example` contains the same public configuration. A local ignored apps/mobile/.env is useful for Expo development; it is excluded from the EAS archive. The actual cloud build reads EAS's environment, not that local file.

`CABO_RELEASE_BUILD=1` is set by the preview/production **eas.json profile**, not by Railway. `EAS_BUILD_PROFILE`, `EAS_BUILD_PROJECT_ID` and other `EAS_BUILD_*` metadata are supplied by EAS. Do not invent or set them manually. Release guards reject localhost, LAN addresses, HTTP, example.com, credential-bearing URLs and mismatched/missing EAS IDs.

`EXPO_TOKEN` is an optional **CLI/CI authentication secret**, replacing interactive Expo login. It belongs in the local/CI secret environment, never in EAS public build variables, source code or the Android app. Interactive device login is already authenticated for this session. Android signing credentials are generated/stored remotely in Expo; never commit credentials.json, JKS/keystore files or their passwords.

Optional push setup later: configure FCM v1 with EAS and the Android Firebase application. A google-services.json file and service-account credentials must be stored through the appropriate protected EAS file/credential workflow, not Git. Push is not a prerequisite for foreground multiplayer. Keep notifications opt-in and do not claim background delivery until tested.

## Deploy safely from the monorepo root

Use Node 22.13+ and Railway CLI 5.71+:

```bash
npm ci
npm run db:generate
npm run typecheck
npm run test:release
npm test
npm run build
npm run railway -- link
npm run railway -- config plan --environment production
npm run railway -- config apply --environment production --yes
npm run railway -- up --project 37cac4c3-91ec-4894-aa61-3797ef8c5722 --service 3f809771-e894-4e05-a733-0fa0da2d4724 --environment production --detach
```

Inspect the plan: it must concern cabo-api only and must not delete resources or variables. Infrastructure is `.railway/railway.ts`; the deprecated railway.json was replaced. Secret ownership is unmanaged, so IaC does not overwrite or print them. The wrapper clears inherited workspace-host Railway metadata and checks the linked project before any command. The hosting service and CABO backend are separate resources.

The Dockerfile installs/builds only server/shared workspaces, prunes development dependencies and runs as an unprivileged user. Railway performs a real database-backed health check. The pre-deploy migration command must succeed before the new container is admitted. One Singapore replica is configured; application sleeping is disabled by the platform default. Do not add replicas before shared connection/presence/publication support exists.

Inspect only the correct service:

```bash
npm run railway -- deployment list --project 37cac4c3-91ec-4894-aa61-3797ef8c5722 --service 3f809771-e894-4e05-a733-0fa0da2d4724 --environment production --limit 5 --json
npm run railway -- logs --service 3f809771-e894-4e05-a733-0fa0da2d4724 --environment production --lines 60
curl --fail https://cabo-api-production.up.railway.app/health
```

GitHub autodeploy has not been connected; the source was uploaded using Railway CLI. There are no commits on the local branch yet. Review/commit/push the source before enabling GitHub autodeploy. No Git push was performed implicitly.

## Verify live authentication and Socket.IO

```bash
npm run verify:live
# For the full authenticated check, set SMOKE_EMAIL and SMOKE_PASSWORD
# privately in your environment to a controlled account, then:
npm run verify:live
```

The verifier prints no credentials/cookies. It checks HTTPS health, unauthorized REST/WSS rejection, the Android association endpoint, actual password login, session cookie, authenticated WSS, private lobby synchronization, logout and session revocation. It removes its empty test lobby membership. Exit 0 means the checks completed, 1 means failure, 2 means a declared check remains unconfigured/unrun (for example missing Android fingerprint or account credentials). Optional `SMOKE_REPORT_PATH` saves a sanitized JSON report.

`scripts/live-multiplayer.mjs` additionally exercises two programmatic clients against the real backend, using SMOKE_EMAIL_1/SMOKE_PASSWORD_1 and SMOKE_EMAIL_2/SMOKE_PASSWORD_2. These should be dedicated QA accounts. It creates real friendships, rooms and matches. It uses secure random draws, never a deterministic/deck-control endpoint. Unencountered powers are marked explicitly, not passed. Programmatic WSS tests are not physical Android verification.

## Build and install the signed APK

Run **in apps/mobile** after installing/authenticating EAS CLI:

```bash
cd apps/mobile
npx eas-cli@27.7.2 whoami
npx eas-cli@27.7.2 project:info
npx eas-cli@27.7.2 env:exec preview 'npx eas-cli@27.7.2 build --profile preview --platform android'
```

Use `env:exec` so the public backend variables are available even during the CLI's early configuration evaluation. The profile requests a signed release APK, internal distribution and Node 22.23.4. It is standalone; it does not require Metro or Expo Go.

This workspace has no initial Git commit. For a source upload without making an implicit commit, use the supported no-VCS mode, preserving the monorepo archive root:

```bash
cd apps/mobile
export EAS_NO_VCS=1
export EAS_PROJECT_ROOT="$(cd ../.. && pwd)"
npx eas-cli@27.7.2 env:exec preview 'npx eas-cli@27.7.2 build --profile preview --platform android'
```

`.easignore` excludes server implementation, all .env files, private credentials, keystores, artifacts and node_modules while preserving workspace manifests and shared/mobile source. No database or backend auth secret is an EAS public variable.

On the first build, allow EAS to generate the Android keystore; it remains remote. The CLI prints an official build URL. Wait for FINISHED and use the build's official artifact URL. A queued/started build is not an APK. Download only after success and verify that the artifact is .apk (not .aab).

```bash
# After a successful build, using its actual ID:
npx eas-cli@27.7.2 build:view BUILD_ID
# Download the APK from that official page, then if adb is available:
adb install -r /path/to/cabo.apk
```

Without adb, open the artifact link on each Android phone, download the APK and allow installation from that browser/file manager. Run the same APK on both phones.

Before sharing invitation links broadly, configure the actual SHA-256 signing fingerprint in Railway and redeploy. Verify `/.well-known/assetlinks.json` returns that fingerprint and package com.caboforfun.app. An upload key or another development keystore's fingerprint is insufficient. New signing certificates require adding their fingerprints. The preview and Play App Signing certificates can differ.

Android production AAB later:

```bash
npx eas-cli@27.7.2 env:exec production 'npx eas-cli@27.7.2 build --profile production --platform android'
```

## Acceptance and unresolved platform checks

Execute [the two-device acceptance plan](ANDROID_ACCEPTANCE.md). It covers real signup/sign-in without email confirmation, private invitations, exact default powers, scoring, settings, reconnect, rematches and user consent. The original email-confirmation cases apply only if you later set REQUIRE_EMAIL_VERIFICATION=true; password-reset cases are blocked until SMTP is enabled. Leave unexecuted cases marked Blocked/Not run. No Android device has been connected to this workspace.

After a successful APK, set ANDROID_STORE_URL to the official preview installation/artifact link if desired. Update the status record with the actual build ID, artifact URL, signing fingerprint and device results. Never mark build completion or real-device acceptance from an API health check alone.

## Current finished preview

[Download the signed APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.0.0-preview.1/cabo-android-v1.0.0-preview.apk) · [Official EAS build](https://expo.dev/accounts/jishnuava/projects/cabo-for-fun/builds/dadf0ab2-62ca-4a5d-885d-faf78a2bfd20). The APK was downloaded and independently signature-checked; its certificate, manifest package/deep link and embedded live backend URL match configuration. It is a standalone release APK. Physical-device execution remains unverified.

The invitation landing page uses the GitHub release APK link. The original Expo artifact URL is retained in deploy/android-preview.json for build provenance. Replace ANDROID_STORE_URL after future builds or when publishing a Play listing. EAS artifact retention is governed by the build record (current expirationDate: 2026-11-25T07:00:04.048Z); that Expo retention limit does not apply to the GitHub release asset. GitHub assets remain available while the release/repository is retained. Existing installations do not depend on the artifact remaining downloadable.
