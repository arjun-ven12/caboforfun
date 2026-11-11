import { defineRailway, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = "cabo-api";
export default defineRailway(() => {
  const caboApi = service("cabo-api", {
    build: {
      buildEnvironment: "V3",
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    start: "node apps/server/dist/index.js",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    preDeploy: "npm run db:migrate",
    replicas: { "asia-southeast1-eqsg3a": 1 },
    deploy: { restartPolicyMaxRetries: 5, overlapSeconds: 0 },
  });

  return project("cabo-production", {
    variables: { managed: false },
    resources: [caboApi],
  });
});
