// src/index.js
require("dotenv").config();

const express = require("express");
const pool = require("./db");
const logger = require("./logger");

const clientsRouter = require("./routes/clients");
const invoicesRouter = require("./routes/invoices");
const expensesRouter = require("./routes/expenses");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.status(200).json({ status: "alive" });
});

app.get("/ready", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ready" });
  } catch (err) {
    logger.error("readiness_check_failed", { reason: err.message });
    res.status(503).json({ status: "not ready", reason: "database" });
  }
});

app.use("/clients", clientsRouter);
app.use("/invoices", invoicesRouter);
app.use("/expenses", expensesRouter);

app.listen(PORT, () => {
  logger.info("server_started", { port: PORT });
});
