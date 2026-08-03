// src/worker-metrics.js
const client = require("prom-client");
const express = require("express");

const jobsCompleted = new client.Counter({
  name: "invoiceflow_bullmq_jobs_completed_total",
  help: "Total BullMQ jobs completed successfully",
  labelNames: ["queue", "job_name"],
});

const jobsFailed = new client.Counter({
  name: "invoiceflow_bullmq_jobs_failed_total",
  help: "Total BullMQ jobs that failed after exhausting retries",
  labelNames: ["queue", "job_name"],
});

const jobDuration = new client.Histogram({
  name: "invoiceflow_bullmq_job_duration_seconds",
  help: "BullMQ job processing duration",
  labelNames: ["queue", "job_name"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
});

const queueWaiting = new client.Gauge({
  name: "invoiceflow_bullmq_jobs_waiting",
  help: "Jobs currently waiting to be processed",
  labelNames: ["queue"],
});
const queueActive = new client.Gauge({
  name: "invoiceflow_bullmq_jobs_active",
  help: "Jobs currently being processed",
  labelNames: ["queue"],
});
const queueDelayed = new client.Gauge({
  name: "invoiceflow_bullmq_jobs_delayed",
  help: "Jobs scheduled for future processing",
  labelNames: ["queue"],
});
const queueFailedBacklog = new client.Gauge({
  name: "invoiceflow_bullmq_jobs_failed_backlog",
  help: "Jobs currently sitting in the failed state",
  labelNames: ["queue"],
});

async function refreshQueueDepthGauges(queue) {
  const counts = await queue.getJobCounts("waiting", "active", "delayed", "failed");
  queueWaiting.set({ queue: queue.name }, counts.waiting || 0);
  queueActive.set({ queue: queue.name }, counts.active || 0);
  queueDelayed.set({ queue: queue.name }, counts.delayed || 0);
  queueFailedBacklog.set({ queue: queue.name }, counts.failed || 0);
}

function startMetricsServer(queue, port = 9100) {
  client.collectDefaultMetrics({ prefix: "invoiceflow_worker_" });
  const app = express();
  app.get("/metrics", async (req, res) => {
    await refreshQueueDepthGauges(queue);
    res.set("Content-Type", client.register.contentType);
    res.end(await client.register.metrics());
  });
  return app.listen(port);
}

module.exports = { jobsCompleted, jobsFailed, jobDuration, startMetricsServer };