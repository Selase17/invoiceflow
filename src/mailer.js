// src/mailer.js
//
// For local development, point SMTP_HOST at something like Mailtrap's
// sandbox (see your Registries/observability course notes on why a
// sandbox SMTP provider avoids real-inbox delivery during development).
// In production, point these env vars at your real transactional email
// provider (SES, SendGrid, etc.) instead.

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "mailhog",
  port: process.env.SMTP_PORT || 1025,
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

async function sendInvoiceEmail(client, invoice, pdfBuffer) {
  return transporter.sendMail({
    from: process.env.FROM_EMAIL || "billing@invoiceflow.local",
    to: client.email,
    subject: `Invoice #${invoice.id} from InvoiceFlow`,
    text: `Hi ${client.name}, please find your invoice attached. Due date: ${invoice.due_date}.`,
    attachments: [
      { filename: `invoice-${invoice.id}.pdf`, content: pdfBuffer },
    ],
  });
}

module.exports = { sendInvoiceEmail };
