# InvoiceFlow — Progress Log

## 2026-08-02

**Containerized the full system** — wrote the Dockerfile (non-root user,
correctly linked group via `-G`, `--chown` on every `COPY` before the
`USER` switch, `chown -R` after `npm ci` since that step runs as root) and
`docker-compose.yml` covering `api`, `worker`, `db`, `redis`, and `mailhog`.

**Decided on one shared image for `api` and `worker`** rather than two
near-identical Dockerfiles — same codebase, different entrypoint selected
via Compose's `command:` override (`npm run start:worker`). Reasoning: both
processes have identical dependencies with no divergence in sight, so one
image avoids duplication/drift risk and keeps them provably running the
same build.

**Applied network segmentation** — `public` and `private` (`internal:
true`) networks, following the least-connectivity principle from the
security material. `db` and `redis` on `private` only; `mailhog` on
`public` only; `api` and `worker` bridge both. Verified with `nc -zv`:
`mailhog` genuinely cannot reach `db`; `worker` can reach both `db` and
`mailhog`.

**Fixed three real YAML bugs during setup:**
- `read_only: true` followed by `tmpfs:` misparsed due to indentation —
  Compose read them as one malformed value instead of two separate keys.
- `network: [private]` (wrong key name, should be `networks:`) nested
  inside `healthcheck:` on `db`, `redis`, and `mailhog` — Compose rejected
  it as an invalid healthcheck property.
- Fixed both; also caught that `redis` had no volume mount despite
  `redis_data` being declared — added it so Redis data actually persists
  across restarts.

**Diagnosed a WSL2/Docker Desktop port-forwarding issue** — `api`
container was `Up` and internally healthy (confirmed via `docker exec
invoiceflow-api curl localhost:3000/health` succeeding from inside the
container), but unreachable from the host. Resolved with a container
restart; recognized this as the same category of issue as prior WSL2
networking hiccups, not an application bug.

**Verified the full functional path (Phase 5 of the verification
roadmap)** — not just "containers are healthy," but actually:
created a client via the API, confirmed it persisted through Postgres,
confirmed it survived an `api` container restart, created an invoice
with line items, triggered `/invoices/:id/send`, confirmed the worker
picked up the job via BullMQ, and confirmed the generated PDF actually
arrived as an email attachment in Mailhog.

**Found and fixed a real PDF rendering bug** — the invoice PDF showed
`$1` instead of `$1500.00` for a line total. Diagnosed precisely (not
guessed) by extracting word-level coordinates from the generated PDF:
`$1500.00` was rendering at `x1=645.9` on a 612pt-wide page — the text was
being drawn entirely off the right edge. Root cause: `pdfkit`'s `continued:
true` chains each column's text position from wherever the previous
column ended, rather than jumping cleanly to the specified x-coordinate,
causing progressive column drift across a row. Fixed by giving each
column an independent `.text(content, x, y)` call with a fixed `y` per
row, removing `continued: true` entirely. Verified the fix the same way —
confirmed no text extends past the page boundary anymore, and visually
rendered the PDF to confirm.

**Confirmed read-only filesystem hardening is genuinely enforced**, not
just declared — `docker exec api touch /app/test.txt` correctly fails
with "Read-only file system."

**Completed resilience testing (Phase 6/7 of the verification roadmap)**
— stopped dependencies mid-run and did a full teardown/rebuild from
scratch (`docker compose down -v` followed by `up -d --build`). Everything
behaved as expected: no crash-loops, graceful handling throughout, and a
clean re-initialization from an empty state.

### Still to do
- Write the GitHub Actions CI/CD pipeline for this project

## 2026-08-03 / 2026-08-04

**Built a full observability stack for InvoiceFlow** — Prometheus, Loki,
Promtail, Grafana, plus dedicated exporters for Redis and Postgres.
Designed a real dashboard covering API golden signals (traffic, errors,
latency, Node.js heap/event-loop saturation), a dedicated "is the worker
keeping up" section (queue depth, job completions/failures, job duration),
and infrastructure saturation panels — plus a matching set of Prometheus
alert rules across all three areas.

**Fixed a genuine gap from the review**: the HTTP middleware in
`src/index.js` was updating Prometheus metrics but never logging anything,
meaning Loki had no per-request visibility at all. Added a proper
`logger[level]("http_request", {...})` call, with severity (`error`/`warn`/
`info`) driven by the actual status code — verified with a real integration
test before deploying.

**Caught and replaced a nonexistent dependency before it ever got deployed**:
the original design relied on `taskforcesh/bullmq-prometheus-exporter`,
which doesn't exist as a public image (`docker compose up` failed with
"pull access denied"). Rather than hunt for an unverified alternative,
built real instrumentation directly into `src/worker.js` instead —
`src/worker-metrics.js`, using BullMQ's own `getJobCounts()` API for queue
depth and a real Histogram (wrapped in `try/finally` around the job
processor) for job duration. Verified end-to-end with a real local Redis
instance and real BullMQ jobs before handing it over — completions,
failures, duration histogram, and queue depth gauges all confirmed correct
against actual test data, not just code review.

**Found and fixed four more real bugs while getting the stack running:**
- Missing `prom-client` dependency (added to observability code, never
  added to `package.json`) — caused both `api` and `worker` to crash-loop
  on startup with `MODULE_NOT_FOUND`.
- `package-lock.json` out of sync after the manual `package.json` edit —
  `npm ci` correctly refused to install until the lock file was
  regenerated with `npm install`.
- Dashboard's datasource template variables used the wrong Grafana schema
  field (`pluginId` instead of `query`), causing "No data sources found"
  across every panel even though Prometheus and Loki were both working
  correctly underneath. Fixed by hardcoding the known datasource UIDs
  directly into every panel and removing the broken `templating` block.
- Metric name mismatch between the dashboard/alert rules (bare `bullmq_*`)
  and the actual instrumented metrics (`invoiceflow_bullmq_*` prefix) —
  every Worker-row panel showed "No data" despite the underlying metrics
  being scraped successfully. Fixed via targeted `sed` replacements,
  verified with negative-lookbehind grep checks to confirm nothing was
  left unprefixed.
- Removed two non-functional Grafana environment variables
  (`GF_DATASOURCES_DEFAULT_*`) that aren't real Grafana settings and were
  silently doing nothing — real datasource provisioning was already
  working correctly through the mounted `datasources.yml`.

**Verified the complete stack against real traffic**: created multiple
clients and invoices, sent them through the real worker pipeline, confirmed
PDFs generated and emails arrived in Mailhog, and confirmed every dashboard
panel — API golden signals, worker queue depth, job completions, job
duration percentiles, Redis/Postgres saturation, and the Loki log explorer
— populated with genuine, correct data traced back to specific real
requests.


## 2026-08-04 (evening)

**Added distributed tracing with Jaeger and OpenTelemetry** — the third
observability pillar, completing logs, metrics, and now traces for
InvoiceFlow. Wrapped `fetch_invoice_data`, `generate_pdf`, and `send_email`
in `worker.js` with manual spans, on top of auto-instrumentation for
Express, `pg`, and Redis.

**Built and proved trace context propagation across the async BullMQ
boundary before deploying it** — the interesting part, since `send-invoice`
crosses a real gap between the API enqueueing a job and the worker picking
it up later. Wrote a real test harness (real Redis, real BullMQ Queue and
Worker, an in-memory span exporter) that injected trace context into job
data on enqueue and extracted it on the worker side, then directly
confirmed the child span's `parentSpanContext.spanId` matched the parent
span's `spanId` exactly — genuine parent-child linkage, not just a
coincidentally-shared trace ID.

**Found and fixed a real bug once it was live**: every worker span was
showing up under the `invoiceflow-api` service name in Jaeger instead of
`invoiceflow-worker`. Root cause was `SERVICE_NAME=invoiceflow-api`
hardcoded in the shared `.env` file, with `api` and `worker` both loading
it via `env_file:` with nothing overriding the value for `worker`. Fixed
by adding an `environment:` override specifically on the `worker` service,
which takes precedence over `env_file:` for the same key.

**Investigated an apparent performance issue, confirmed it wasn't one**:
early traces showed `pg.connect` costing 30-56ms on both the API and
worker sides, on every single request. Rather than assume this was a
connection-pooling bug, tested it properly — sent three invoices in rapid
succession with no delay between them, then checked the trace for the
last one. `pg-pool.connect` dropped to under 1ms with no `pg.connect` span
at all, confirming the pool was correctly reusing warm connections; the
earlier cost was simply `pg.Pool`'s default 10-second idle timeout closing
the connection between spaced-out manual test requests. No code change
needed - correctly identified as expected behavior, not a defect.


### Still to do
- Write the GitHub Actions CI/CD pipeline for this project
