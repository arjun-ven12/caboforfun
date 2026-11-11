# CABO deployment status — 2026-11-11

This is the current operational record, separate from the initial local verification report.

| Item                                 | Verified result                                                                                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production backend                   | Deployed: https://cabo-api-production.up.railway.app                                                                                                                                     |
| Railway project / service            | cabo-production / cabo-api; isolated from workspace hosting                                                                                                                              |
| Deployment configuration             | Supported `.railway/railway.ts`; plan has zero pending changes                                                                                                                           |
| Runtime                              | Successful remote Docker build; one Singapore replica; Node 22; health/pre-deploy configured                                                                                             |
| Neon runtime/direct connectivity     | Both independently verified with TLS                                                                                                                                                     |
| Production migrations                | All three applied successfully after confirming an empty public schema and saving a private schema backup                                                                                |
| HTTPS health                         | Passed; returns status ok after a real database query                                                                                                                                    |
| Authentication policy                | Email/password accounts, **no mandatory confirmation email**, REQUIRE_EMAIL_VERIFICATION=false                                                                                           |
| Real signup / sessions               | Two ordinary production signups obtained sessions without administrative verification                                                                                                    |
| Authenticated WSS                    | Passed: session cookies, lobby synchronization, acknowledgements, logout and revocation                                                                                                  |
| Live multiplayer                     | Passed with two programmatic HTTPS/Socket.IO clients, including every default power, both Black King choices, successful/failed matching, rule locking, scoring, reconnect and rematches |
| Local regression suite               | 61 passed; separate local PostgreSQL, never the production database                                                                                                                      |
| Release environment guard            | 14 passed; installable builds reject localhost/HTTP/LAN/example origins and invalid project IDs                                                                                          |
| EAS account/project                  | Authenticated and linked to @jishnuava/cabo-for-fun, UUID 4647123c-0e97-4b96-8598-34d6c470bd3c                                                                                           |
| EAS preview and production variables | Configured to use the live HTTPS backend and invitation domain                                                                                                                           |
| Android signing                      | EAS-managed signing key created; only its public SHA-256 fingerprint was retrieved                                                                                                       |
| Android association file             | Live file includes the configured package and certificate fingerprint                                                                                                                    |
| Preview APK                          | **FINISHED**; downloaded and independently verified with Android apksig. Signature v2 valid; release APK, not debuggable/test-only.                                                      |
| Real Android devices                 | **Not run**: no adb or connected device in this workspace                                                                                                                                |

Direct APK download: https://github.com/arjun-ven12/caboforfun/releases/download/v1.0.0-preview.1/cabo-android-v1.0.0-preview.apk

Official preview build: https://expo.dev/accounts/jishnuava/projects/cabo-for-fun/builds/dadf0ab2-62ca-4a5d-885d-faf78a2bfd20

Public SHA-256 signing fingerprint:

```
98:D7:9D:E7:8C:D6:5F:43:70:B2:68:13:69:F2:1C:46:1E:D7:31:82:6A:63:AC:BC:5A:A3:A6:C4:FB:BB:3B:18
```

[Live multiplayer evidence](production-live-multiplayer.json) contains sanitized test results. The run used 25 turns to encounter all custom powers. It did not alter the deck or disable secrecy. Every temporary QA account, room, match and session was removed afterward. An earlier transport-only probe used an administratively verified temporary fixture before the requested policy change; the final ordinary-signup and game run did not.

SMTP, Google/Apple OAuth, FCM/APNs, background push delivery, Play publishing and iOS distribution remain optional/unconfigured. Password reset is not currently available without SMTP. The login hides unconfigured account options. No sender or provider configuration is faked.

Programmatic multiplayer and an APK build cannot establish real-device UI, OS App Link handling, installation, notification delivery or frame-rate results. Execute [two-device acceptance](ANDROID_ACCEPTANCE.md) using the same signed APK on both phones and record actual results. See [the production runbook](PRODUCTION_DEPLOYMENT.md) for every variable, its configuration location, build and deployment commands.

## Verified Android artifact

- Package: com.caboforfun.app; version 1.0.0, versionCode 1.
- APK size: 100926516 bytes (about 96.3 MiB).
- Minimum Android API: 24 (Android 7.0); target API: 36. These are manifest values, not a claim of device execution on every OS.
- APK certificate SHA-256 matches the certificate published by the live assetlinks endpoint.
- Embedded standalone Hermes bundle contains the deployed HTTPS API URL; the localhost:3000 API fallback is absent.
- Manifest has the correct verified HTTPS /join/ intent and autoVerify=true. debuggable=false and testOnly=false.
- APK file SHA-256: `7d950d35026f56f4ffff77c7a31dba83e13ea652e5497c5bdc484786245a7b87`.
- [Machine-readable artifact evidence](../deploy/android-preview.json).

No physical Android installation or OS link verification was performed here. Install this exact APK on both phones and execute the acceptance plan.

Final post-redeploy checks: live health 200/status ok; emailVerificationRequired=false; assetlinks certificate matches the actual APK signer; invitation landing page contains the verified APK download URL.
