# Dockerfile + Compose Verification Roadmap

A step-by-step checklist for going from "I wrote a Dockerfile and Compose
file" to "I'm actually confident this is correct" — in order, since later
steps assume earlier ones passed.

Run this top to bottom for InvoiceFlow right now. Keep it for every future
project.

---

## Phase 0 — Before You Build Anything

- [ ] `.dockerignore` exists and excludes `node_modules`, `.git`, `.env`, `*.md`
- [ ] `.gitignore` excludes `.env` and `node_modules`
- [ ] `.env` exists (copied from `.env.example`, never the example file itself used directly)
- [ ] Every `COPY` before your `USER` instruction has `--chown=<user>:<group>`
- [ ] Any `RUN` step that installs dependencies (npm ci, pip install, etc.)
      is followed by `chown -R <user>:<group> /app` if it runs before `USER`
- [ ] Non-root user creation uses the correct syntax for your base image
      (Alpine: `addgroup`/`adduser -G`; Debian: `groupadd`/`useradd -g`)

## Phase 1 — Build

```bash
docker compose build --no-cache
```

- [ ] Build completes with no errors
- [ ] No unexpected warnings about deprecated syntax or missing files

## Phase 2 — Start the Stack

```bash
docker compose up -d
docker compose ps
```

- [ ] Every service shows `Up`, not `Restarting` or `Exited`
- [ ] Every service with a healthcheck shows `healthy`, not stuck on
      `starting` indefinitely
- [ ] If anything is `Restarting`: `docker compose logs <service> --tail 30`
      immediately — do not proceed until this is resolved

## Phase 3 — Container-Level Verification (per service that runs your own code)

```bash
docker exec <container> id
```
- [ ] UID and GID both belong to your intended non-root user, not `root`,
      not `nogroup`

```bash
docker exec <container> ls -la /app
```
- [ ] Every file is owned by your app user, not `root`

```bash
docker exec <container> sudo -l
```
- [ ] Returns "not found" (no escalation path available)

```bash
docker inspect <container> --format='{{.HostConfig.Privileged}}'
```
- [ ] Returns `false`

## Phase 4 — Network Verification

```bash
docker inspect <container> --format='{{json .NetworkSettings.Networks}}' | jq
```
- [ ] Each service is on exactly the networks you intended — nothing extra

For every pair that should NOT be able to reach each other:
```bash
docker compose exec <service-a> nc -zv <service-b> <port>
```
- [ ] Connection fails (as intended)

For every pair that SHOULD be able to reach each other:
```bash
docker compose exec <service-a> nc -zv <service-b> <port>
```
- [ ] Connection succeeds

## Phase 5 — Functional Verification (does the app actually work)

This is the phase most people skip, and it's the one that actually matters.
Containers being "Up" and "healthy" proves the process started — it does
NOT prove the application logic works correctly.

- [ ] Hit every read endpoint and confirm a real response, not just a 200:
```bash
curl localhost:3000/health
curl localhost:3000/ready
curl localhost:3000/clients
```

- [ ] Create real data through the API, then confirm it persists:
```bash
curl -X POST localhost:3000/clients -H "Content-Type: application/json" \
  -d '{"name":"Test Client","email":"test@example.com"}'

curl localhost:3000/clients
# Confirm the client you just created is actually in the response
```

- [ ] Confirm data survives a container restart (not `rm`, just `restart`):
```bash
docker compose restart api
curl localhost:3000/clients
# Same client should still be there
```

- [ ] For anything involving a background worker: trigger the action,
      then confirm the SIDE EFFECT actually happened, not just that the
      API returned 202:
```bash
curl -X POST localhost:3000/invoices/1/send
docker compose logs worker --tail 20
# Confirm you see the job actually being picked up and completed,
# not just the API's "queued" response
```

- [ ] For email: check it actually arrived somewhere you can see
      (Mailhog's UI at localhost:8025, or your sandbox provider's dashboard)

- [ ] For anything producing a file (a generated PDF, for example):
      confirm the actual output is valid, not just that no error was thrown

## Phase 6 — Resilience Checks

- [ ] Stop a dependency and confirm the dependent service handles it
      gracefully (doesn't crash-loop, reports a sensible error):
```bash
docker compose stop db
curl localhost:3000/ready
# Should return 503 with a clear reason, not hang or crash the whole app
docker compose start db
```

- [ ] Confirm `depends_on: condition: service_healthy` is actually doing
      its job — stop everything, start only the dependent service, confirm
      it waits:
```bash
docker compose down
docker compose up -d api
docker compose logs api --tail 20
# Should show api waiting for/failing gracefully until db and redis
# are healthy, not immediately crashing
```

- [ ] Test read-only filesystem hardening explicitly, if you've applied it:
```bash
docker compose exec api touch /app/test.txt
# Should fail with a permission error - confirms read_only is
# actually enforced, not just declared in YAML
```

## Phase 7 — Cleanup and Reset

- [ ] Confirm a full teardown and rebuild from scratch actually works —
      this catches "it works on my machine because of leftover state"
      problems before someone else (or future-you) hits them:
```bash
docker compose down -v
docker compose up -d --build
# Wait for healthy, then re-run Phase 5's functional checks
```

---

## The Honest Rule

Phases 0-2 catch build and startup problems — fast, cheap to check, do
every time. Phase 3-4 catch security and networking misconfigurations —
worth doing once per project, and after any Dockerfile/Compose change.
**Phase 5 is the one that actually proves the system works** — containers
being healthy is necessary but never sufficient. Skipping straight to
"it's Up, ship it" without Phase 5 is the single most common way a
container setup looks correct and isn't.
