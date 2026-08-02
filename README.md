# InvoiceFlow

Expense tracking and invoicing system — a real multi-service application
built as a hands-on subject for DevOps practice: Dockerfiles, Compose,
registries, security hardening, observability, and eventually CI/CD.

## What this actually does

- Manage clients
- Create invoices with line items
- Send an invoice — generates a PDF and emails it, asynchronously via a
  background worker (not blocking the API request)
- Track expenses
- Automatically mark invoices overdue on a daily schedule

## Architecture (services you'll containerize)

| Service | Role |
|---|---|
| `api` | REST API — `src/index.js` |
| `worker` | Background job processor — `src/worker.js`. Same codebase, different entrypoint. |
| `postgres` | Primary datastore |
| `redis` | Job queue backing the worker (BullMQ) |
| *(your choice)* | Reverse proxy / TLS termination — nginx recommended |

The `api` and `worker` are two processes from the *same* codebase, started
with different npm scripts (`start:api` vs `start:worker`) — meaning
they'll likely share one Dockerfile with two different `CMD`/entrypoint
options, or two thin Dockerfiles both `COPY`-ing the same source. Worth
deciding deliberately which approach you prefer.

## Required environment variables

```
# Postgres
DB_HOST=db
DB_PORT=5432
DB_NAME=invoiceflow
DB_USER=postgres
DB_PASSWORD=postgres

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Email (point at a sandbox SMTP provider like Mailtrap for local dev)
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
FROM_EMAIL=billing@invoiceflow.local

# API
PORT=3000
SERVICE_NAME=invoiceflow-api
```

## Database setup

Run `db/schema.sql` against Postgres on first startup — mount it into
Postgres's `/docker-entrypoint-initdb.d/` (same pattern as your
`observability-lab` project) and it'll run automatically the first time
the container starts with an empty data volume.

## API reference

```
GET    /health              liveness check
GET    /ready                readiness check (verifies DB connectivity)

POST   /clients              { name, email }
GET    /clients               list all clients
GET    /clients/:id           get one client

POST   /invoices              { client_id, due_date, line_items: [{ description, quantity, unit_price_cents }] }
GET    /invoices              list all invoices
GET    /invoices/:id          get one invoice with its line items
POST   /invoices/:id/send     queues the invoice to be PDF'd and emailed (returns 202 immediately)

POST   /expenses              { client_id?, description, amount_cents, incurred_on }
GET    /expenses              list all expenses
```

## Running it locally without Docker first (recommended before containerizing)

It's worth running this directly with `node` at least once, against a
Postgres and Redis you have running some other way, just to confirm the
application itself behaves as expected before you introduce the Docker
layer — that way, if something breaks after you containerize it, you know
the problem is in your Docker/Compose setup, not the app itself.

```bash
npm install
npm run start:api     # in one terminal
npm run start:worker  # in another
```