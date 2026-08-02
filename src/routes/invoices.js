// src/routes/invoices.js
const express = require("express");
const pool = require("../db");
const logger = require("../logger");
const { invoiceQueue } = require("../queue");

const router = express.Router();

// Create an invoice with line items in one request
router.post("/", async (req, res) => {
  const { client_id, due_date, line_items } = req.body;

  if (!client_id || !due_date || !Array.isArray(line_items) || line_items.length === 0) {
    return res.status(400).json({ error: "client_id, due_date, and at least one line item are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const total = line_items.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);

    const invoiceResult = await client.query(
      "INSERT INTO invoices (client_id, due_date, total_cents) VALUES ($1, $2, $3) RETURNING *",
      [client_id, due_date, total]
    );
    const invoice = invoiceResult.rows[0];

    for (const item of line_items) {
      await client.query(
        "INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price_cents) VALUES ($1, $2, $3, $4)",
        [invoice.id, item.description, item.quantity, item.unit_price_cents]
      );
    }

    await client.query("COMMIT");
    logger.info("invoice_created", { invoice_id: invoice.id, client_id, total_cents: total });
    res.status(201).json(invoice);
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("invoice_create_failed", { error: err.message });
    res.status(500).json({ error: "failed to create invoice" });
  } finally {
    client.release();
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM invoices ORDER BY created_at DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error("invoices_list_failed", { error: err.message });
    res.status(500).json({ error: "failed to list invoices" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const invoiceResult = await pool.query("SELECT * FROM invoices WHERE id = $1", [req.params.id]);
    if (invoiceResult.rows.length === 0) {
      return res.status(404).json({ error: "invoice not found" });
    }
    const lineItemsResult = await pool.query(
      "SELECT * FROM invoice_line_items WHERE invoice_id = $1",
      [req.params.id]
    );
    res.status(200).json({ ...invoiceResult.rows[0], line_items: lineItemsResult.rows });
  } catch (err) {
    logger.error("invoice_lookup_failed", { error: err.message });
    res.status(500).json({ error: "failed to retrieve invoice" });
  }
});

// Enqueues a background job - the worker actually generates the PDF
// and sends the email. This route returns immediately, without waiting
// for either of those slower operations to complete.
router.post("/:id/send", async (req, res) => {
  const invoiceId = req.params.id;
  try {
    const result = await pool.query("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "invoice not found" });
    }

    await invoiceQueue.add("send-invoice", { invoiceId: Number(invoiceId) });
    logger.info("invoice_send_queued", { invoice_id: invoiceId });
    res.status(202).json({ status: "queued", invoice_id: invoiceId });
  } catch (err) {
    logger.error("invoice_send_failed", { invoice_id: invoiceId, error: err.message });
    res.status(500).json({ error: "failed to queue invoice send" });
  }
});

module.exports = router;
