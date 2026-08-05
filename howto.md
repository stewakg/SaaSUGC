# HOWTO.md — Getting into the VPS (for a fresh Claude Code session)

> Written for a Claude Code session that has no prior context on this project. If you're picking this
> up cold, also read `CLAUDE.md` (how to work here) and `INFRASTRUCTURE.md` (living source of
> truth, phase checkboxes) — this file is narrowly scoped to **VPS access only**.

---

## 1. What the VPS is for

The user's existing Hetzner VPS hosts the **production worker** (`apps/worker` — the BullMQ job
consumer) and its **Redis** instance. `apps/web` (the Next.js app) is NOT on this VPS — it runs locally
in dev, and its production home (Vercel vs. also-on-this-VPS) is still an open decision (see
`INFRASTRUCTURE.md` F6).

---

## 2. Connection details

| | |
|---|---|
| IP | `46.225.214.52` |
| Hostname | `aikutak` |
| OS | Ubuntu 24.04.4 LTS |
| User | `root` |
| Auth | SSH key only (no password auth). The key (`~/.ssh/id_ed25519`) already exists on the user's
local machine and is already trusted by the VPS — **do not generate a new key or ask the user for a
password**; if `ssh root@46.225.214.52` doesn't just work, something else is wrong (wrong machine, key
not present, etc.) — stop and ask the user rather than trying to work around SSH auth. |
| Resources | 2 vCPU (AMD EPYC-Genoa), 3.7GB RAM, 75GB disk. ~52GB disk free, ~2.7GB RAM available as of
2026-07-18 — modest headroom, be mindful of what you spin up. |

**Connect:**
```
ssh root@46.225.214.52
```
That's it — no port, no jump host, no extra flags needed under normal circumstances.

---

## 3. What's actually running there

This VPS is otherwise general-purpose (hostname `aikutak` predates this project) — an old "openclaw"
project and an orphaned "n8n" Docker volume were fully removed from it earlier with the user's explicit
permission, specifically to free it up for this app. As of 2026-07-18, **only this app's two containers
exist** on the box:

```
NAMES               STATUS       IMAGE
adgen-worker-prod   Up           adgen-worker
adgen-redis-prod    Up (healthy) redis:7-alpine
```

Everything is scoped under the Docker Compose project name **`adgen`** and lives at **`/opt/adgen-saas`**
on the VPS. Redis is bound to `127.0.0.1:6379` only (not exposed to the public internet — reachable only
from processes on the VPS itself, or via an SSH tunnel from outside, see §5).

**Do not touch anything outside `/opt/adgen-saas` or containers not prefixed `adgen-`** — this box may
run other things for the user unrelated to this project.

---

## 4. Common tasks

**Check both containers are up:**
```
ssh root@46.225.214.52 "docker ps -a --filter name=adgen"
```

**Tail worker logs (most useful for debugging):**
```
ssh root@46.225.214.52 "docker logs adgen-worker-prod --tail 100 -f"
```
Logs are structured JSON, one line per event (`{"level":"info","msg":"job done","meta":{"jobId":"..."}}`
etc.).

**Restart the worker** (e.g. after editing its `.env` on the VPS):
```
ssh root@46.225.214.52 "cd /opt/adgen-saas && docker compose -f infra/docker-compose.prod.yml -p adgen restart worker"
```

**Add/change a real provider API key** (e.g. once the user has a kie.ai key):
The worker's real `.env` lives ONLY on the VPS at `/opt/adgen-saas/apps/worker/.env` — it is gitignored
and was hand-created via SSH, it is NOT synced from the local repo's `.env`. To edit it:
```
ssh root@46.225.214.52 "cat /opt/adgen-saas/apps/worker/.env"   # see current state first
ssh root@46.225.214.52
# then on the VPS:
nano /opt/adgen-saas/apps/worker/.env   # add the key
exit
# back on local machine:
ssh root@46.225.214.52 "cd /opt/adgen-saas && docker compose -f infra/docker-compose.prod.yml -p adgen restart worker"
```
Currently every key in that file is blank except the real Supabase ones (mock mode for everything else).

**Redeploy after a code change.** A git remote now exists
(`github.com/stewakg/SaaSUGC.git`, added after this file was first written), so a
`git pull` on the VPS is an option too — but the raw file sync below still works and
does not depend on the VPS having credentials for the repo:
```
# from the local repo root:
tar czf - --exclude=node_modules --exclude=.git --exclude=.next --exclude=storage --exclude=.env \
  --exclude=.claude --exclude=.vscode -C "<local repo root>" . \
  | ssh root@46.225.214.52 "mkdir -p /opt/adgen-saas && tar xzf - -C /opt/adgen-saas"
ssh root@46.225.214.52 "cd /opt/adgen-saas && docker compose -f infra/docker-compose.prod.yml -p adgen up -d --build"
```
Watch the rebuild output for errors, then re-check logs (previous command) to confirm it came up clean
(no restart-looping).

---

## 5. Testing the full pipeline locally against the real VPS worker

The local `apps/web` dev server needs to reach the VPS's Redis to enqueue jobs the VPS worker will
actually pick up. Since Redis is loopback-only on the VPS (by design — unauthenticated Redis exposed
publicly is a real botnet target), you reach it through an SSH port-forward:

1. Open a tunnel (run this in the background — it must stay open for the whole test session):
   ```
   ssh -N -L 127.0.0.1:6379:127.0.0.1:6379 root@46.225.214.52
   ```
2. Confirm the local repo root's `.env` has `REDIS_URL=redis://127.0.0.1:6379`, then run
   `pnpm run env:sync` if you changed it.
3. `pnpm dev` (starts `apps/web` locally — NOT the worker, that's already running on the VPS).
4. Log in, submit any job (e.g. "Brzi test" — cheapest, 2 credits), then check
   `docker logs adgen-worker-prod` on the VPS to confirm it was picked up and completed there, not
   handled by some local fallback.

**Gotcha already hit once**: if a previous tunnel attempt died without being cleanly killed, a new tunnel
attempt on the same port will fail with `Address already in use`. Find and kill the stale process
holding port 6379 locally before retrying (on Windows: `Get-Process -Id <pid>` /
`Stop-Process -Id <pid> -Force` once you've identified the orphaned `ssh.exe`).

---

## 6. What NOT to do here

- Don't expose Redis's port publicly (no `0.0.0.0:6379` binding) — it's intentionally loopback-only.
- Don't run destructive Docker commands (`docker system prune`, `docker rm -f` on non-`adgen-*`
  containers, `docker volume rm` on anything not clearly part of this project) without explicit user
  confirmation — this box has other history on it (see §3).
- Don't commit or paste the contents of `/opt/adgen-saas/apps/worker/.env` anywhere (chat, git, docs) —
  it holds a real Supabase service-role key even in mock mode. Reference that it exists and where, never
  its actual values.
