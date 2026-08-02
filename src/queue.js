// src/queue.js
//
// A single shared queue definition. The API service enqueues jobs onto
// this queue; the worker service (src/worker.js) is the only thing that
// actually processes them. This is the async-worker pattern - the API
// responds to the client immediately, and the potentially slow work
// (PDF generation, sending email) happens separately, in the background.

const { Queue } = require("bullmq");

const connection = {
  host: process.env.REDIS_HOST || "redis",
  port: process.env.REDIS_PORT || 6379,
};

const invoiceQueue = new Queue("invoice-jobs", { connection });

module.exports = { invoiceQueue, connection };
