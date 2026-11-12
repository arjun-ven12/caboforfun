# Android preview 1.2 — AI opponents

[Download signed APK](https://github.com/arjun-ven12/caboforfun/releases/download/v1.2.0-preview.1/cabo-android-v1.2.0-preview.apk) · [GitHub release](https://github.com/arjun-ven12/caboforfun/releases/tag/v1.2.0-preview.1) · [Official EAS build](https://expo.dev/accounts/jishnuava/projects/cabo-for-fun/builds/9d84db20-7690-4f8e-9f07-3f907f626746)

Version **1.2.0**, Android versionCode **5**. The same signing certificate allows updating the previous preview without uninstalling. Use this build on all participating phones.

This release adds Play vs AI, 1–4 bot opponents, five presets/custom difficulty and personalities, saved configurations, legitimate card memory, server-hosted solo/mixed games, bonus-compatible actions, pause/resume/restart, practice hints, separate statistics and rematches. **Offline play is deferred.** No LLM provider/key is needed.

Assets: `cabo-android-v1.2.0-preview.apk`, `SHA256SUMS.txt`, `android-preview.json`. The APK is an unchanged EAS artifact, distributed as a release asset rather than a Git blob.

SHA-256:

```
e9cfe8060f537fc08850cd769746b8890453bec80e9d26b0a8ae64547247978a
```

Independent apksig and manifest checks passed: package `com.caboforfun.app`, version 1.2.0/code 5, min API 24/target 36, v2 signature, correct HTTPS `/join/` intent, debuggable/testOnly false. The standalone Hermes bundle contains the live backend URL and AI UI; no localhost API fallback is present.

Validation: 115 automated tests, 14 release guards, clean GitHub CI, production migration, real authenticated solo/mixed smoke tests and 10,150 seeded bot matches. See [changed files, architecture, measurements and limitations](BOTS.md). The benchmark does not establish that Master is stronger than Expert. Native device appearance, haptics, OS links and measured FPS remain unverified; follow [the device acceptance plan](ANDROID_ACCEPTANCE.md).

The backend is https://cabo-api-production.up.railway.app. Email/password accounts require no confirmation email. Optional OAuth, recovery mail and background push retain their external setup requirements. Secrets, sessions, signing keys and private snapshots are excluded from Git.
