// tests/unit/invoice-total.test.js
//
// Tests the line-item total calculation logic that lives inside the
// POST /invoices route. We extract the formula (quantity * unit_price_cents)
// and test it in isolation — no HTTP server, no database required.

"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// The formula under test — mirrors what invoices.js does:
//   const total = line_items.reduce(
//     (sum, item) => sum + item.quantity * item.unit_price_cents, 0
//   );
function calcTotal(lineItems) {
  return lineItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price_cents,
    0
  );
}

describe("Invoice total calculation", () => {
  it("sums a single line item correctly", () => {
    const items = [{ quantity: 3, unit_price_cents: 1000 }];
    assert.equal(calcTotal(items), 3000);
  });

  it("sums multiple line items correctly", () => {
    const items = [
      { quantity: 2, unit_price_cents: 5000 },  // 10000
      { quantity: 1, unit_price_cents: 2500 },  //  2500
      { quantity: 4, unit_price_cents: 750 },   //  3000
    ];
    assert.equal(calcTotal(items), 15500);
  });

  it("returns 0 for an empty item list", () => {
    assert.equal(calcTotal([]), 0);
  });

  it("handles a single item with quantity 1 at 1 cent", () => {
    assert.equal(calcTotal([{ quantity: 1, unit_price_cents: 1 }]), 1);
  });

  it("handles large quantities and prices without integer overflow", () => {
    // 10,000 units at $9,999.99 each = $99,999,900 total
    const items = [{ quantity: 10000, unit_price_cents: 999999 }];
    assert.equal(calcTotal(items), 9_999_990_000);
  });

  it("accumulates correctly across many small items", () => {
    const items = Array.from({ length: 100 }, () => ({
      quantity: 1,
      unit_price_cents: 99,
    }));
    assert.equal(calcTotal(items), 9900);
  });
});
