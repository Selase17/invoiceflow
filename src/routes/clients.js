// src/routes/clients.js
const express = require("express");
const pool = require("../db");
const logger = require("../logger");

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: "name and email are required" });
  }
  try {
    const result = await pool.query(
      "INSERT INTO clients (name, email) VALUES ($1, $2) RETURNING *",
      [name, email]
    );
    logger.info("client_created", { client_id: result.rows[0].id });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error("client_create_failed", { error: err.message });
    res.status(500).json({ error: "failed to create client" });
  }
});

router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM clients ORDER BY created_at DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    logger.error("clients_list_failed", { error: err.message });
    res.status(500).json({ error: "failed to list clients" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM clients WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "client not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    logger.error("client_lookup_failed", { error: err.message });
    res.status(500).json({ error: "failed to retrieve client" });
  }
});

module.exports = router;
