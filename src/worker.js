// src/worker.js
require("dotenv").config();

const { Worker, Queue } = require("bullmq");
const pool = require("./db");
const logger = require("./logger");
const { connection, invoiceQueue } = require("./queue");
const { generateInvoicePdf } = require("./pdf");
const { sendInvoiceEmail } = require("./mailer");

// ─── The main job processor ────────────────────────────────────────
// This is the actual async-worker pattern: the API's POST /invoices/:id/send
// route just enqueues a job and returns immediately. This function is
// what does the real (potentially slow) work - generating a PDF and
// sending an email - completely separately from any client waiting on
// an HTTP response.
const worker = new Worker(
  "invoice-jobs",
  async (job) => {
    if (job.name === "send-invoice") {
      const { invoiceId } = job.data;

      const invoiceResult = await pool.query("SELECT * FROM invoices WHERE id = $1", [invoiceId]);
      if (invoiceResult.rows.length === 0) {
        throw new Error(`invoice ${invoiceId} not found`);
      }
      const invoice = invoiceResult.rows[0];

      const clientResult = await pool.query("SELECT * FROM clients WHERE id = $1", [invoice.client_id]);
      const client = clientResult.rows[0];

      const lineItemsResult = await pool.query(
        "SELECT * FROM invoice_line_items WHERE invoice_id = $1",
        [invoiceId]
      );

      const pdfBuffer = await generateInvoicePdf(invoice, client, lineItemsResult.rows);
      await sendInvoiceEmail(client, invoice, pdfBuffer);

      await pool.query(
        "UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1",
        [invoiceId]
      );

      logger.info("invoice_sent", { invoice_id: invoiceId, client_email: client.email });
      return { sent: true };
    }

    if (job.name === "check-overdue") {
      const result = await pool.query(
        `UPDATE invoices SET status = 'overdue'
         WHERE status = 'sent' AND due_date < CURRENT_DATE
         RETURNING id`
      );
      logger.info("overdue_check_completed", { marked_overdue: result.rows.length });
      return { marked_overdue: result.rows.length };
    }
  },
  { connection }
);

worker.on("completed", (job) => {
  logger.info("job_completed", { job_id: job.id, job_name: job.name });
});

worker.on("failed", (job, err) => {
  logger.error("job_failed", { job_id: job?.id, job_name: job?.name, error: err.message });
});

// ─── Scheduling the recurring overdue-check job ────────────────────
// BullMQ's repeatable jobs handle this - no separate cron process needed,
// the worker itself schedules and processes this on a recurring pattern.
async function scheduleRecurringJobs() {
  await invoiceQueue.add(
    "check-overdue",
    {},
    { repeat: { pattern: "0 6 * * *" } } // every day at 06:00
  );
  logger.info("recurring_jobs_scheduled");
}

scheduleRecurringJobs();

logger.info("worker_started");
