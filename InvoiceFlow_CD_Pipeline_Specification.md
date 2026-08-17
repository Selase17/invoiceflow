# InvoiceFlow — CD Pipeline Specification (EC2 Deployment)

**Assumptions made explicit up front** (correct me if any are wrong):
- Single EC2 instance, not an Auto Scaling Group or ECS/EKS — matches the
  project's current single-host Compose architecture
- Ubuntu-based AMI
- You'll provision the instance manually first (this spec assumes it
  already exists); Terraform/IaC for the instance itself is a separate,
  later exercise
- Two environments: `staging` (auto-deployed) and `production` (gated on
  manual approval) — matching the CI/CD course's Continuous Delivery
  pattern
- Full observability stack (Prometheus/Loki/Grafana/Jaeger) is **deferred**
  on the EC2 box initially — flagged as a real decision point below, not
  silently dropped

---

## Part 1 — EC2 Instance Prerequisites

### 1.1 Instance sizing

| Environment | Instance type | Reasoning |
|---|---|---|
| Staging | `t3.small` (2 vCPU, 2GB RAM) | `api`, `worker`, `db`, `redis`, `mailhog`, `nginx` — 6 lightweight containers |
| Production | `t3.medium` (2 vCPU, 4GB RAM) | Same services, real traffic headroom, Postgres needs more working memory under load |

**Not sized for the full observability stack** (Prometheus + Loki + Grafana
+ Jaeger + 3 exporters) running alongside the app on the same instance —
see Part 8 for the deferred decision on this.

### 1.2 Security group

| Port | Source | Purpose |
|---|---|---|
| 22 | Your IP only (not `0.0.0.0/0`) | SSH — deploy access |
| 80 | `0.0.0.0/0` | HTTP → redirects to HTTPS |
| 443 | `0.0.0.0/0` | HTTPS — the only real public entrypoint |

**Nothing else open.** `db` (5432), `redis` (6379) — never exposed to the
internet, only reachable by `api`/`worker` on the instance's internal Docker
network, exactly matching the segmentation already built locally.

### 1.3 What must be installed on the instance, once, manually

```bash
# Docker + Compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt install -y docker-compose-plugin

# A dedicated, non-root deploy user (do NOT deploy as root or ec2-user)
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
```

### 1.4 SSH key for CI to authenticate as `deploy`

```bash
ssh-keygen -t ed25519 -f deploy_key -C "invoiceflow-ci-deploy" -N ""
# Public half → ~deploy/.ssh/authorized_keys on the EC2 instance
# Private half → GitHub secret (per environment, see Part 3)
```

---

## Part 2 — DNS and TLS

### 2.1 DNS

A real domain (or subdomain) pointed at the instance's Elastic IP —
`staging.invoiceflow.example.com` and `invoiceflow.example.com`, or
similar. An Elastic IP specifically (not the instance's default public
IP), so the address survives an instance stop/start.

### 2.2 TLS — real certificates, not the self-signed one from local dev

Your local `nginx.conf` uses a self-signed cert, correctly rejected by
every real browser and every automated client. For a real deployment:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d invoiceflow.example.com
```

Certbot will rewrite your nginx config to reference its own
Let's-Encrypt-issued cert paths, and installs a systemd timer for
automatic renewal (certs expire every 90 days). **This means your
`nginx.conf` needs a production-specific variant** — the container-based
nginx setup you built for local dev assumes the cert/key are bind-mounted
in from `nginx/certs/`; a real deployment either runs certbot **on the
host** (outside Docker, terminating TLS before nginx even sees the
traffic) or runs certbot inside the nginx container with a persistent
volume for the certs. The host-level approach is simpler and more
standard — recommended here.

---

## Part 3 — Secrets and Configuration

### 3.1 GitHub Environments

Two environments, created under repo **Settings → Environments**:

- **`staging`** — no required reviewers, deploys automatically on every
  merge to `main` after CI passes
- **`production`** — required reviewer(s) configured, deploys only after
  manual approval

### 3.2 Secrets, scoped per environment (never repository-wide)

| Secret | Staging value | Production value |
|---|---|---|
| `SSH_HOST` | staging instance IP/hostname | production instance IP/hostname |
| `SSH_USER` | `deploy` | `deploy` |
| `SSH_PRIVATE_KEY` | staging's private key half | production's private key half — **a genuinely different keypair**, not the same one reused |
| `DB_PASSWORD` | staging DB password | production DB password — different value |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASSWORD` | Mailhog (no real creds needed) | a real transactional email provider (SES, SendGrid) — Mailhog is a dev-only tool, never appropriate in production |

**Why separate SSH keypairs per environment specifically:** if staging's
key were ever compromised (a genuinely lower-stakes environment, more
likely to be experimented on), it should grant zero access to production.

### 3.3 The `.env` file on each instance

**Never committed, never transmitted via the workflow file directly.**
Placed on each instance once, manually, during initial setup:

```bash
# On the EC2 instance, as the deploy user
nano /opt/invoiceflow/.env
chmod 600 /opt/invoiceflow/.env
```

The deploy pipeline never writes secret *values* into the instance — it
only triggers `docker compose up -d`, which reads the `.env` file already
sitting there. This keeps real production credentials out of GitHub
Actions logs entirely.

---

## Part 4 — The Production Compose File

**A separate `compose.prod.yml`, layered on top of your base `compose.yml`
— not the same file you use for local dev.** Real differences:

```yaml
services:
  api:
    image: ghcr.io/<you>/invoiceflow-api:${IMAGE_TAG}
    # no 'build:' key at all - production NEVER builds, only pulls
    # no bind mounts - no ./src:/app/src style dev conveniences
    restart: unless-stopped

  worker:
    image: ghcr.io/<you>/invoiceflow-worker:${IMAGE_TAG}
    restart: unless-stopped

  frontend:
    image: ghcr.io/<you>/invoiceflow-frontend:${IMAGE_TAG}
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    restart: unless-stopped
    volumes:
      - /opt/invoiceflow/data/postgres:/var/lib/postgresql/data
      # a REAL host path, backed up separately (Part 7) - not an
      # anonymous Docker volume that's easy to accidentally lose

  nginx:
    restart: unless-stopped
    # certs handled by host-level certbot per Part 2.2, or mounted
    # from a path certbot manages

  mailhog:
    # Present in staging. Explicitly REMOVED entirely from production -
    # a fake SMTP catcher has no place in a real environment; production
    # points SMTP_HOST at a real provider directly.
```

Every image reference uses `${IMAGE_TAG}` as a variable — this is what
lets promotion be a pure retag, never a rebuild, exactly per the
Registries course's build-once-promote-everywhere principle.

---

## Part 5 — The Actual Pipeline (extending your existing `ci.yml`)

### 5.1 Full job graph

```
test → build-scan-push (api, worker, frontend)
           │
           ▼
   promote-to-staging (auto)
           │
           ▼
   deploy-to-staging (auto, SSH)
           │
           ▼
   smoke-test-staging (auto)
           │
           ▼
   promote-to-production (needs: smoke-test-staging)
   [PAUSES — requires manual approval on the 'production' environment]
           │
           ▼
   deploy-to-production (SSH)
           │
           ▼
   smoke-test-production
```

### 5.2 Promotion — retag, never rebuild

```yaml
promote-to-staging:
  needs: build-scan-push
  if: github.ref == 'refs/heads/main'
  runs-on: ubuntu-latest
  environment: staging
  steps:
    - uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    - run: |
        for svc in api worker frontend; do
          docker pull ghcr.io/<you>/invoiceflow-$svc:${{ github.sha }}
          docker tag ghcr.io/<you>/invoiceflow-$svc:${{ github.sha }} ghcr.io/<you>/invoiceflow-$svc:staging
          docker push ghcr.io/<you>/invoiceflow-$svc:staging
        done
```

### 5.3 Deployment — SSH, pull, apply schema if needed, up

```yaml
deploy-to-staging:
  needs: promote-to-staging
  runs-on: ubuntu-latest
  environment: staging
  steps:
    - uses: appleboy/ssh-action@v1
      with:
        host: ${{ secrets.SSH_HOST }}
        username: ${{ secrets.SSH_USER }}
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /opt/invoiceflow
          export IMAGE_TAG=staging
          docker compose -f compose.yml -f compose.prod.yml pull
          docker compose -f compose.yml -f compose.prod.yml up -d
          docker image prune -f
```

**`docker image prune -f`** at the end matters — without it, every deploy
leaves the previous image sitting on the instance's limited disk,
accumulating indefinitely.

### 5.4 The schema-migration gap — a real, unsolved problem worth naming

Your current `db-init/001_create_orders.sql`-equivalent schema files only
run automatically on Postgres's **first ever startup**, when the data
volume is empty. On a real production instance, the volume is *never*
empty after the first deploy — meaning **future schema changes (a new
column, a new table) will never automatically apply** through this
mechanism.

This needs an actual migration tool before production is trustworthy —
`node-pg-migrate` or similar, run as an explicit pipeline step:

```yaml
    - uses: appleboy/ssh-action@v1
      with:
        # ... same connection details ...
        script: |
          cd /opt/invoiceflow
          docker compose exec -T api npm run migrate
```

**This is flagged deliberately, not glossed over** — right now, InvoiceFlow
has no migration tooling at all, only a one-time schema file. Adding real
migrations is a prerequisite for this CD pipeline to be genuinely safe
past the very first deploy, not an optional nice-to-have.

### 5.5 Smoke test — confirm the deploy actually worked, not just that commands ran

```yaml
smoke-test-staging:
  needs: deploy-to-staging
  runs-on: ubuntu-latest
  steps:
    - run: |
        for i in $(seq 1 15); do
          STATUS=$(curl -sk -o /dev/null -w "%{http_code}" https://staging.invoiceflow.example.com/api/health)
          [ "$STATUS" = "200" ] && break
          sleep 2
        done
        if [ "$STATUS" != "200" ]; then
          echo "Deploy verification failed - /health returned $STATUS"
          exit 1
        fi
```

This is the actual proof a deploy worked — matching the discipline from
your Phase 5 verification roadmap ("containers being Up is not the same
as the app working").

---

## Part 6 — Rollback

Since every image is sha-tagged in the registry (Part 5.2), rollback is
retagging `staging`/`prod` to a **previous** known-good sha — never a
rebuild, never touching source code under pressure:

```yaml
name: Rollback

on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        options: [staging, production]
      sha:
        description: 'Commit SHA to roll back to'
        required: true

jobs:
  rollback:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    steps:
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - run: |
          for svc in api worker frontend; do
            docker pull ghcr.io/<you>/invoiceflow-$svc:${{ inputs.sha }}
            docker tag ghcr.io/<you>/invoiceflow-$svc:${{ inputs.sha }} ghcr.io/<you>/invoiceflow-$svc:${{ inputs.environment }}
            docker push ghcr.io/<you>/invoiceflow-$svc:${{ inputs.environment }}
          done
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SSH_HOST }}
          # ... deploy exactly as in 5.3 ...
```

**Honest caveat, same as the original CI/CD course material**: if the bad
release included a schema migration, rolling back the *code* doesn't
undo the *database change* — the old code may not work against the new
schema. Real rollback safety requires migrations to be written
backward-compatible for at least one release, a discipline this spec
flags but doesn't fully solve.

---

## Part 7 — Backups (currently nothing exists for this — real gap)

Postgres data lives at `/opt/invoiceflow/data/postgres` on the instance
(Part 4). **Right now, nothing backs this up.** A single instance failure
loses every client, invoice, and expense record permanently. Minimum
viable fix:

```bash
# A cron job on the instance itself, or a scheduled GitHub Actions
# workflow that SSHes in and runs this:
docker compose exec -T db pg_dump -U postgres invoiceflow | gzip > /opt/invoiceflow/backups/$(date +%F).sql.gz

# Ship it OFF the instance too - a backup living on the same disk as
# the thing it's backing up doesn't survive that instance's disk failing
aws s3 cp /opt/invoiceflow/backups/$(date +%F).sql.gz s3://your-backup-bucket/
```

Needs its own IAM role/credentials (scoped to just this one S3 bucket,
write-only if possible — least privilege again) and its own scheduled
trigger, separate from the deploy pipeline itself.

---

## Part 8 — The Deferred Decision: Observability on EC2

**Real tradeoff, not a settled question — worth deciding deliberately:**

**Option A — Full stack on the same instance.** Prometheus + Loki +
Grafana + Jaeger + 3 exporters, exactly as built locally. Genuine
resource cost: on a `t3.medium`, this competes directly with `api`/`worker`/
`db` for the same 4GB of RAM — a real risk of the observability stack
itself degrading application performance, or Prometheus/Loki's storage
growing unbounded on a small root volume over time.

**Option B — A managed observability platform instead.** Grafana Cloud's
free tier (or similar) accepts remote-write from a lightweight Prometheus
agent and Promtail, without running Grafana/Prometheus/Loki's storage
layer on your own instance at all. Meaningfully less operational risk for
a small production deployment; the tradeoff is depending on a third-party
service and, past the free tier, a real cost.

**Option C — Logs/metrics only, defer tracing.** Run a slimmed stack
(Prometheus + Loki + Grafana, skip Jaeger) — matching the same
right-sizing reasoning from the Observability course's Chapter 23, now
applied to production resource constraints specifically, not just
learning-curve reasoning.

**This spec doesn't pick for you** — worth deciding based on actual
instance size and how much you're willing to operate versus offload.

---

## Part 9 — Full Checklist, In Order

- [ ] EC2 instance provisioned, security group locked down (Part 1.2)
- [ ] Docker + Compose installed, non-root `deploy` user created (Part 1.3)
- [ ] Separate SSH keypairs generated for staging and production (Part 1.4)
- [ ] DNS pointed at an Elastic IP (Part 2.1)
- [ ] Certbot installed, real TLS cert issued and auto-renewing (Part 2.2)
- [ ] GitHub Environments created with correct required-reviewer settings (Part 3.1)
- [ ] All secrets added, scoped per environment, never repository-wide (Part 3.2)
- [ ] `.env` placed manually on each instance, `chmod 600` (Part 3.3)
- [ ] `compose.prod.yml` written — no `build:`, no dev bind mounts, `mailhog` removed from production (Part 4)
- [ ] Migration tooling added to the codebase — **blocking**, not optional (Part 5.4)
- [ ] Full pipeline written: promote → deploy → smoke-test, for both environments (Part 5)
- [ ] Rollback workflow written and tested at least once deliberately, before you ever need it for real (Part 6)
- [ ] Automated backups running and verified restorable — not just running (Part 7)
- [ ] Observability approach for EC2 explicitly decided, not defaulted into (Part 8)

**The one item on this list that blocks everything else being trustworthy:
Part 5.4, migrations.** Everything else can be built and refined
incrementally; deploying real schema changes with no migration tooling
is the one gap that turns "the pipeline works" into "the pipeline works
until the first time you need to change the database," silently.
