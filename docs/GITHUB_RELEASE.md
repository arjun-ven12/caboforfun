# Android preview release 1.1

Release: [v1.1.0-preview.1](https://github.com/arjun-ven12/caboforfun/releases/tag/v1.1.0-preview.1)

[Download the signed Android APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.1.0-preview.1/cabo-android-v1.1.0-preview.apk) · [Official EAS build](https://expo.dev/accounts/jishnuava/projects/cabo-for-fun/builds/fd550347-1ca4-44b6-94f5-ff0afb58e2ae)

Application version **1.1.0**, Android versionCode **3**. This prerelease updates the existing app with private-safe real-time swap feedback, bounded outgoing-card bonus powers and canonical unique usernames. Both phones should use this APK.

Assets: `cabo-android-v1.1.0-preview.apk`, `SHA256SUMS.txt`, `android-preview.json`. The EAS APK is distributed unchanged as a GitHub release asset, never a Git blob. Its SHA-256 is:

```
6903baf468c14c96716e4cf16feac9c4be22a4a81359091fbc783b7c2536a516
```

Independent Android apksig verification succeeded with the same signing certificate as 1.0.0. Manifest checks confirm package `com.caboforfun.app`, API 24 minimum/36 target, versionCode 3, verified HTTPS `/join/` intent, and debuggable/testOnly false. The embedded standalone Hermes bundle contains the live backend URL, the new bonus/feedback UI, and no localhost API fallback.

Validation: 92 regression tests, 14 release guards, GitHub clean-install CI, production migration, live default-power multiplayer lifecycle and separate blind-swap/Black King outgoing-bonus reconnect checks. See [the file-level change and behavior report](SWAP_RELEASE_1.1.md).

Physical Android installation, visual motion/haptics and OS link handoff remain unverified. Execute [the two-device acceptance plan](ANDROID_ACCEPTANCE.md). Email/password users do not need confirmation email. Optional OAuth, email recovery and background push retain their external setup requirements. Database credentials, backend auth secrets, sessions and signing keys are excluded from Git.
