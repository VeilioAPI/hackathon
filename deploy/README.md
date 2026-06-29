# Deployment (Docker)

Docker build assets for the full Veilio Exchange stack. Orchestrated by `docker-compose.yml` at the repo root.

| Directory | Image | Description |
|-----------|-------|-------------|
| `canton/` | `veilio-exchange-canton` | Daml build + Canton multinode (5 participants) |
| `backend/` | `veilio-exchange-backend` | Node.js REST API |
| `frontend/` | `veilio-exchange-frontend` | Next.js dashboard |

**Start everything:**

```powershell
docker compose up --build -d
```

See [docs/DOCKER.md](../docs/DOCKER.md).
