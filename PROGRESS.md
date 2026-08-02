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
