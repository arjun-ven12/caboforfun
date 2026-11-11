# Android preview release

Release: [v1.0.0-preview.1](https://github.com/arjun-ven12/caboforfun/releases/tag/v1.0.0-preview.1)

[Download the signed Android APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.0.0-preview.1/cabo-android-v1.0.0-preview.apk)

This prerelease contains the independently verified EAS preview APK (application version 1.0.0, versionCode 1), source code, and deployment documentation. The APK was built by EAS build dadf0ab2-62ca-4a5d-885d-faf78a2bfd20; it is distributed unchanged. GitHub is the primary download location; Expo remains the original build/provenance record.

Release assets:

- cabo-android-v1.0.0-preview.apk
- SHA256SUMS.txt
- android-preview.json (public build and signature verification metadata)

APK SHA-256:

```
7d950d35026f56f4ffff77c7a31dba83e13ea652e5497c5bdc484786245a7b87
```

Install the same APK on both Android phones. The app connects to https://cabo-api-production.up.railway.app and uses email/password accounts without mandatory email confirmation. Android API 24+ is declared in the manifest. The binary is a standalone release APK with a valid v2 signature; debuggable and testOnly are false.

Validation: 61 regression tests, 14 release environment checks, and live two-client HTTPS/WSS game checks. Actual physical-phone gameplay and OS App Link handoff remain unverified; follow [the acceptance plan](ANDROID_ACCEPTANCE.md). Optional OAuth, email recovery and background push require their external providers.

The APK is a release asset, not a Git blob. Database credentials, backend auth secrets, sessions, local environment files, signing keystores and node_modules are excluded from Git.
