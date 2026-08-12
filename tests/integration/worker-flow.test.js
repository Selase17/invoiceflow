// tests/integration/worker-flow.test.js
//
// The single most valuable integration test for this project: verify that
// the full async path works end-to-end.
//
//   API enqueues a job
//     → Worker picks it up from Redis
//     → Worker generates PDF + sends email via MailHog
//     → Worker sets invoice.status = 'sent' in Postgres
//
// This is the part of the system that ONLY a background process completes —
// no request/response cycle ever touches it — so no unit test can cover it.
//
// Prerequisites:
//   - Postgres running (DB_* env vars)
//   - Redis running (REDIS_* env vars)
//   - MailHog running on SMTP_HOST:1025 (the worker's mailer points here)
//   - The worker process already started (ci.yml does: node src/worker.js &)

"use strict";

require("dotenv").config();

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const pg = require("pg");
const { Queue } = require("bullmq");

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || "localhost",
  port:     Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || "invoiceflow",
  user:     process.env.DB_USER     || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
});

const queue = new Queue("invoice-jobs", {
  connection: {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createTestClient() {
  const res = await pool.query(
    "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
    ["Worker Flow Test", `worker-${Date.now()}@example.com`]
  );
  return res.rows[0].id;
}

async function createDraftInvoice(clientId) {
  const res = await pool.query(
    `INSERT INTO invoices (client_id, due_date, total_cents, status)
     VALUES ($1, '2026-12-31', 5000, 'draft') RETURNING id`,
    [clientId]
  );
  return res.rows[0].id;
}

async function createSentInvoice(clientId) {
  const res = await pool.query(
    `INSERT INTO invoices (client_id, due_date, total_cents, status)
     VALUES ($1, '2020-01-01', 5000, 'sent') RETURNING id`,
    [clientId]
  );
  return res.rows[0].id;
}

async function getInvoice(id) {
  const res = await pool.query(
    "SELECT status, sent_at FROM invoices WHERE id = $1",
    [id]
  );
  return res.rows[0];
}

// Poll condition() every intervalMs until it returns true or timeoutMs elapses.
async function waitUntil(condition, { timeoutMs = 20000, intervalMs = 500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Worker: send-invoice job", () => {
  let clientId;
  let invoiceId;

  before(async () => {
    clientId = await createTestClient();
    invoiceId = await createDraftInvoice(clientId);
  });


  it("flips invoice status to 'sent' and sets sent_at after the worker processes the job", async () => {
    // Pre-condition: invoice starts as 'draft'
    const before = await getInvoice(invoiceId);
    assert.equal(before.status, "draft");
    assert.equal(before.sent_at, null);

    // Enqueue exactly as the API route does (POST /invoices/:id/send)
    await queue.add("send-invoice", { invoiceId });

    // Wait for the worker to complete it
    const done = await waitUntil(async () => {
      const row = await getInvoice(invoiceId);
      return row.status === "sent";
    });

    assert.ok(
      done,
      `Invoice ${invoiceId} was not marked 'sent' within 20 s. ` +
      "Ensure the worker process is running and SMTP_HOST (MailHog) is reachable."
    );

    const after = await getInvoice(invoiceId);
    assert.equal(after.status, "sent");
    assert.ok(after.sent_at !== null, "sent_at should be populated");
  });
});

describe("Worker: check-overdue job", () => {
  let clientId;
  let invoiceId;

  // Note: pool/queue are re-used from the outer scope, closed by the first
  // describe's after() hook. This test must run in the same process to share
  // them. Node --test runs test files sequentially by default so this is safe.
  before(async () => {
    clientId = await pool.query(
      "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING id",
      ["Overdue Test", `overdue-${Date.now()}@example.com`]
    ).then((r) => r.rows[0].id);

    // Invoice with past due_date and status='sent' — candidate for 'overdue'
    invoiceId = await createSentInvoice(clientId);
  });

  it("marks past-due 'sent' invoices as 'overdue'", async () => {
    // Enqueue a one-off check-overdue job (bypasses the 06:00 cron)
    const q = new Queue("invoice-jobs", {
      connection: {
        host: process.env.REDIS_HOST || "localhost",
        port: Number(process.env.REDIS_PORT) || 6379,
      },
    });

    await q.add("check-overdue", {});
    await q.close();

    const done = await waitUntil(async () => {
      const row = await getInvoice(invoiceId);
      return row.status === "overdue";
    });

    assert.ok(
      done,
      `Invoice ${invoiceId} (due 2020-01-01) was not marked 'overdue' within 20 s.`
    );
  });
});

// File-level teardown - runs once, after BOTH describe blocks have
// fully completed, not after just the first one.
after(async () => {
  await pool.end();
  await queue.close();
});
