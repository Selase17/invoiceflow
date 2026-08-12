// tests/unit/pdf-columns.test.js
//
// Regression test for the column-boundary bug: when a line item has a very
// large quantity or price, generateInvoicePdf() must still complete without
// error and produce a valid PDF buffer. The geometric x-coordinate assertion
// (no text past the 562pt right margin) is done in the workflow via a
// separate Python/pdfplumber step — see ci.yml — because Node has no native
// PDF coordinate parser. Here we assert what Node can verify cheaply.
//
// Page geometry for reference:
//   Letter width = 612 pt, margin = 50 pt → printable right edge = 562 pt
//   COL = { description: 50, qty: 300, unitPrice: 370, total: 470 }
//   "Total" column starts at 470; text must end before 562.

"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { generateInvoicePdf } = require("../../src/pdf.js");

const invoice = { id: 1, due_date: "2026-12-31" };
const client  = { name: "Acme Corp", email: "billing@acme.com" };

// The original bug case: 9999 units at $99,999.99 — the value that
// previously caused the Total column to drift off the right page edge.
const bigLineItems = [
  {
    description: "Enterprise license (annual, all seats)",
    quantity: 9999,
    unit_price_cents: 9999999,
  },
];

const normalLineItems = [
  { description: "Consulting (hourly)", quantity: 8,  unit_price_cents: 15000 },
  { description: "Expenses",            quantity: 1,  unit_price_cents: 4500  },
];

describe("PDF column boundary regression", () => {
  let bigPdf;
  let normalPdf;

  before(async () => {
    [bigPdf, normalPdf] = await Promise.all([
      generateInvoicePdf(invoice, client, bigLineItems),
      generateInvoicePdf(invoice, client, normalLineItems),
    ]);
  });

  it("produces a non-empty buffer for normal line items", () => {
    assert.ok(normalPdf instanceof Buffer, "result should be a Buffer");
    assert.ok(normalPdf.length > 0, "buffer should be non-empty");
  });

  it("produces a non-empty buffer for the large quantity/price bug case", () => {
    assert.ok(bigPdf instanceof Buffer, "result should be a Buffer");
    assert.ok(bigPdf.length > 0, "buffer should be non-empty");
  });

  it("both PDFs start with the %PDF magic bytes", () => {
    assert.equal(normalPdf.subarray(0, 4).toString("ascii"), "%PDF");
    assert.equal(bigPdf.subarray(0, 4).toString("ascii"), "%PDF");
  });

  it("large-value PDF is not drastically smaller than normal (sanity check)", () => {
    // More text content → equal or larger file. A significant regression
    // here would signal something wrong with the rendering path.
    assert.ok(
      bigPdf.length >= normalPdf.length - 1000,
      `big PDF (${bigPdf.length} bytes) should not be much smaller than ` +
      `normal PDF (${normalPdf.length} bytes)`
    );
  });
});
