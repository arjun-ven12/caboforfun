# CABO production infrastructure

This directory manages only CABO's `cabo-api` service. Infrastructure variables are intentionally **unmanaged**; secrets live in Railway's Variables UI and never in the authoring file.

Use Node 22 and Railway CLI 5.71+ from the repository root:

```bash
npm ci
npm run railway -- link
npm run railway -- config plan --environment production
npm run railway -- config apply --environment production --yes
npm run railway -- up --project 37cac4c3-91ec-4894-aa61-3797ef8c5722 --service 3f809771-e894-4e05-a733-0fa0da2d4724 --environment production --detach
```

The wrapper removes inherited Railway hosting context, confirms the linked CABO project, and works around the SDK's `_` executable lookup. The explicit service/project/environment flags are deliberate. Never deploy to the workspace-hosting service.

Keep the monorepo root as the build root. The Dockerfile installs/builds server and shared workspaces only. The backend uses one Singapore replica, preserves authoritative state in Neon, applies additive Prisma migrations before each deployment, and serves HTTPS/WSS through Railway's public domain.

The former `railway.json` has been replaced: new Railway services use Infrastructure as Code. See [Railway's current guide](https://docs.railway.com/infrastructure-as-code). Applying IaC does not upload the application's source; `railway up` does that. No GitHub autodeploy has been configured.
