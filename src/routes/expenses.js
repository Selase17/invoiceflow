// src/routes/expenses.js
const express = require("express");
const pool = require("../db");
const logger = require("../logger");

const router = express.Router();

router.post("/", async (req, res) => {
  const { client_id, description, amount_cents, incurred_on } = req.body;
  if (!description || !amount_cents || !incurred_on) {
    return res.status(400).json({ error: "description, amount_cents, and incurred_on are required" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO expenses (client_id, description, amount_cents, incurred_on) VALUES ($1, $2, $3, $4) RETURNING *",
      [client_id || null, description, amount_cents, incurred_on]
    );
    logger.info("expense_created", { expense_id: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error("expense_create_failed", { error: err.message });
    res.status(500).json({ error: "failed to create expense" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM expenses ORDER BY incurred_on DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error("expenses_list_failed", { error: err.message });
    res.status(500).json({ error: "failed to list expenses" });
  }
});

module.exports = router;
