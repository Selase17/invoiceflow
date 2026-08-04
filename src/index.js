// src/index.js

require("./tracing");

require("dotenv").config();

const express = require("express");
const client = require("prom-client");
const pool = require("./db");
const logger = require("./logger");

const clientsRouter = require("./routes/clients");
const invoicesRouter = require("./routes/invoices");
const expensesRouter = require("./routes/expenses");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ─── Prometheus metrics ────────────────────────────────────────────
client.collectDefaultMetrics({ prefix: "invoiceflow_" });

const httpRequestDuration = new client.Histogram({
  name: "invoiceflow_http_request_duration_seconds",
  help: "HTTP request latency",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

const httpRequestTotal = new client.Counter({
  name: "invoiceflow_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status_code"],
});

// Normalise dynamic segments so /invoices/123 and /invoices/456 share a label
function normaliseRoute(path) {
  return path.replace(/\/\d+/g, "/:id");
}

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer();
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const route = normaliseRoute(req.path);
    const statusCode = res.statusCode;
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const labels = { method: req.method, route, status_code: statusCode };

    end(labels);
    httpRequestTotal.inc(labels);

    const level = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";
    logger[level]("http_request", {
      method: req.method,
      route,
      status_code: statusCode,
      duration_ms: Math.round(durationSeconds * 1000),
    });
  });

  next();
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

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
