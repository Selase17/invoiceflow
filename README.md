

![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![CI](https://github.com/Selase17/invoiceflow/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-green)
![Grafana](https://img.shields.io/badge/Grafana-Dashboards-F46800?logo=grafana&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?logo=prometheus&logoColor=white)
![Loki](https://img.shields.io/badge/Loki-Logging-F5A623)
![Promtail](https://img.shields.io/badge/Promtail-Log%20Shipping-6E6E6E)
![Jaeger](https://img.shields.io/badge/Jaeger-Tracing-60D0E4?logo=jaeger&logoColor=white)
# InvoiceFlow

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![CI](https://github.com/Selase17/invoiceflow/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-green)
![Grafana](https://img.shields.io/badge/Grafana-Dashboards-F46800?logo=grafana&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?logo=prometheus&logoColor=white)
![Loki](https://img.shields.io/badge/Loki-Logging-F5A623)
![Promtail](https://img.shields.io/badge/Promtail-Log%20Shipping-6E6E6E)
![Jaeger](https://img.shields.io/badge/Jaeger-Tracing-60D0E4?logo=jaeger&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-Dashboards-F46800?logo=grafana&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?logo=prometheus&logoColor=white)
![Loki](https://img.shields.io/badge/Loki-Logging-F5A623)
![Promtail](https://img.shields.io/badge/Promtail-Log%20Shipping-6E6E6E)
![Jaeger](https://img.shields.io/badge/Jaeger-Tracing-60D0E4?logo=jaeger&logoColor=white)

A multi-service expense tracking and invoicing application, built as a hands-on DevOps project covering the full lifecycle: containerised app development, CI/CD, observability, and staged production deployment.

## Architecture

- **API** — Node.js/Express, handles invoices, clients, expenses
- **Worker** — BullMQ background job processor (invoice PDF generation, email delivery)
- **Frontend** — React/Vite dashboard, served via nginx
- **Postgres** — primary datastore, schema managed via [node-pg-migrate](https://github.com/salsita/node-pg-migrate)
- **Redis** — job queue backing store for the worker
- **nginx** — reverse proxy and TLS termination

### Observability

- **Prometheus** + **Grafana** — metrics and dashboards
- **Loki** + **Promtail** — centralised structured logging
- **Jaeger** — distributed tracing across API → worker → Postgres, via OpenTelemetry
- Postgres/Redis exporters for infrastructure-level metrics

## CI/CD

GitHub Actions pipeline, gated end to end:

1. **Fast checks** — syntax, `npm ci`, config lint
2. **Unit tests** — business logic (totals, route normalisation, PDF layout)
3. **Integration tests** — real Postgres/Redis/Mailhog service containers
4. **Docker build validation** — non-root user, `.dockerignore` enforcement
5. **Security scanning** — Trivy (CRITICAL/HIGH hard gate) and `npm audit`
6. **Build & push** images to GHCR, tagged by commit SHA
7. **Promote → deploy → smoke-test**, staging first (automatic), then production (manual approval gate)

Deployment runs on a self-hosted GitHub Actions runner. Each environment (staging/production) runs as an isolated Compose stack with its own database, network, and remapped ports — no shared state between them.

## Local development

```bash
cp .env.example .env
docker compose up -d
```

API available at `http://localhost:3000`, frontend via nginx at `https://localhost` (self-signed cert in dev).

## Running migrations

```bash
npm run migrate:up
npm run migrate:down
npm run migrate:create <name>
```

## License

See [LICENSE](./LICENSE).
