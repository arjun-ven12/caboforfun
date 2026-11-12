import type { ExpoConfig } from "expo/config";
const { resolveMobileConfig } = require("./scripts/release-config.cjs");
const deployment = require("../../deploy/production.json");
const mobile = resolveMobileConfig({
  ...process.env,
  EXPO_PUBLIC_EAS_PROJECT_ID:
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID || deployment.expoProjectId,
});
const domain: string = mobile.domain;
const config: ExpoConfig = {
  name: "CABO",
  owner: process.env.EXPO_OWNER || deployment.expoOwner,
  slug: "cabo-for-fun",
  scheme: "cabo",
  version: "1.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.caboforfun.app",
    associatedDomains: [`applinks:${domain}`],
    usesAppleSignIn: true,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: {
    package: "com.caboforfun.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#244D3D",
    },
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [{ scheme: "https", host: domain, pathPrefix: "/join/" }],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        imageWidth: 160,
        backgroundColor: "#F5F2EB",
        dark: { backgroundColor: "#171E1B" },
      },
    ],
  ],
  experiments: { typedRoutes: false },
  extra: { eas: { projectId: mobile.projectId } },
};
export default config;
