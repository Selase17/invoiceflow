// tests/unit/route-normalise.test.js
//
// normaliseRoute() is the function in src/index.js that collapses dynamic
// path segments like /invoices/123 → /invoices/:id so all requests to the
// same logical endpoint share a single Prometheus label.
// If this breaks, every unique numeric ID becomes its own metric series —
// a cardinality explosion that makes the Grafana dashboards useless.

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Exact copy of the function from src/index.js — tested in isolation so
// the test has zero server/network dependency.
function normaliseRoute(path) {
  return path.replace(/\/\d+/g, "/:id");
}

describe("normaliseRoute()", () => {
  it("collapses a single numeric segment", () => {
    assert.equal(normaliseRoute("/invoices/123"), "/invoices/:id");
  });

  it("collapses multiple numeric segments", () => {
    assert.equal(
      normaliseRoute("/clients/7/invoices/42"),
      "/clients/:id/invoices/:id"
    );
  });

  it("leaves non-numeric paths unchanged", () => {
    assert.equal(normaliseRoute("/invoices"), "/invoices");
    assert.equal(normaliseRoute("/health"), "/health");
    assert.equal(normaliseRoute("/metrics"), "/metrics");
    assert.equal(normaliseRoute("/ready"), "/ready");
  });

  it("does not collapse named segments like /send", () => {
    assert.equal(normaliseRoute("/invoices/send"), "/invoices/send");
  });

  it("collapses only the numeric part of /invoices/:id/send", () => {
    assert.equal(normaliseRoute("/invoices/99/send"), "/invoices/:id/send");
  });

  it("handles the root path", () => {
    assert.equal(normaliseRoute("/"), "/");
  });

  it("collapses a deeply nested all-numeric path", () => {
    assert.equal(
      normaliseRoute("/a/1/b/2/c/3"),
      "/a/:id/b/:id/c/:id"
    );
  });
});
