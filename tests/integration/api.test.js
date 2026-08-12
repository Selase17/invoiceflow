// tests/integration/api.test.js
//
// Integration tests for the HTTP API.
// Requires a real Postgres instance (DB_* env vars) and the API server
// running on PORT (default 3000). In CI, services: in the workflow provides
// Postgres and starts the server before this runs. Locally:
//   docker compose up db redis -d && node src/index.js &

"use strict";

require("dotenv").config();

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

const BASE_URL = `http://localhost:${process.env.PORT || 3000}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function waitForServer(retries = 30, delayMs = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet — keep waiting
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(
    `Server at ${BASE_URL} did not become ready in ${retries * delayMs}ms`
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /health", () => {
  before(() => waitForServer());

  it("returns 200 with status: alive", async () => {
    const { status, body } = await get("/health");
    assert.equal(status, 200);
    assert.equal(body.status, "alive");
  });
});

describe("GET /ready", () => {
  before(() => waitForServer());

  it("returns 200 when Postgres is reachable", async () => {
    const { status, body } = await get("/ready");
    assert.equal(status, 200);
    assert.equal(body.status, "ready");
  });
});

describe("POST /clients", () => {
  before(() => waitForServer());

  it("returns 400 when name is missing", async () => {
    const { status, body } = await post("/clients", { email: "x@example.com" });
    assert.equal(status, 400);
    assert.ok(body.error, "response should include an error field");
  });

  it("returns 400 when email is missing", async () => {
    const { status, body } = await post("/clients", { name: "Alice" });
    assert.equal(status, 400);
    assert.ok(body.error);
  });

  it("returns 400 when body is empty", async () => {
    const { status } = await post("/clients", {});
    assert.equal(status, 400);
  });

  it("returns 201 and persists a valid client", async () => {
    const email = `ci-test-${Date.now()}@example.com`;
    const { status, body } = await post("/clients", {
      name: "CI Test Client",
      email,
    });
    assert.equal(status, 201);
    assert.ok(body.id, "response should include the new client id");
    assert.equal(body.name, "CI Test Client");
    assert.equal(body.email, email);

    // Confirm persistence: the client must be fetchable by id
    const { status: getStatus, body: getBody } = await get(`/clients/${body.id}`);
    assert.equal(getStatus, 200);
    assert.equal(getBody.id, body.id);
    assert.equal(getBody.email, email);
  });
});

describe("POST /invoices", () => {
  let validClientId;

  before(async () => {
    await waitForServer();
    // Create a real client to hold a valid FK reference
    const { body } = await post("/clients", {
      name: "Invoice Test Client",
      email: `inv-ci-${Date.now()}@example.com`,
    });
    assert.ok(body.id, "setup: failed to create test client");
    validClientId = body.id;
  });

  it("returns 201 and correct total_cents for a valid invoice", async () => {
    const { status, body } = await post("/invoices", {
      client_id: validClientId,
      due_date: "2026-12-31",
      line_items: [
        { description: "Consulting", quantity: 2, unit_price_cents: 10000 },
        { description: "Expenses",   quantity: 1, unit_price_cents: 4500  },
      ],
    });
    assert.equal(status, 201);
    assert.ok(body.id);
    assert.equal(body.total_cents, 24500); // 2×10000 + 1×4500
  });

  it("returns 400 when line_items is empty", async () => {
    const { status } = await post("/invoices", {
      client_id: validClientId,
      due_date: "2026-12-31",
      line_items: [],
    });
    assert.equal(status, 400);
  });

  it("returns 400 when due_date is missing", async () => {
    const { status } = await post("/invoices", {
      client_id: validClientId,
      line_items: [{ description: "x", quantity: 1, unit_price_cents: 100 }],
    });
    assert.equal(status, 400);
  });

  // The specific bug hit manually with client_id: 2 when no such client exists.
  // The FK violation must return a clean 500 — not a crash, not a hung request.
  it("returns 500 with a clean error body when client_id violates FK", async () => {
    const { status, body } = await post("/invoices", {
      client_id: 999999, // guaranteed to not exist
      due_date: "2026-12-31",
      line_items: [{ description: "x", quantity: 1, unit_price_cents: 100 }],
    });
    assert.equal(status, 500);
    assert.ok(body.error, "response must include an error field (not a crash)");
  });
});
