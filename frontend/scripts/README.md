# Scripts

| Folder | Purpose |
|--------|---------|
| `docker/` | Start/stop the full Docker stack |
| `local/` | Local development without Docker (Canton, PostgreSQL, backend, frontend) |

**Docker (recommended):** from the repo root run `docker compose up --build -d`, or use `.\scripts\docker\up.cmd` on Windows.

**Local dev:** see [docs/APP_SETUP.md](../docs/APP_SETUP.md) and [docs/CANTON_SETUP.md](../docs/CANTON_SETUP.md).

**Lifecycle validation (local Canton):**

```powershell
.\scripts\local\start-canton.cmd
.\scripts\local\run-multinode-lifecycle.cmd
```
