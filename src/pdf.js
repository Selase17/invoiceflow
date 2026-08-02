// src/pdf.js
const PDFDocument = require("pdfkit");

// Generates a PDF invoice into an in-memory buffer, rather than writing
// to disk - keeps the worker's filesystem writes to nothing, which
// matters if you later want the worker container to run read-only too.
function generateInvoicePdf(invoice, client, lineItems) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Column x-positions, defined once, used consistently for every row.
    // Chosen so the rightmost column (Total) ends comfortably within the
    // page width (612pt for letter size, with 50pt margins on each side -
    // usable width ends at x=562).
    const COL = { description: 50, qty: 300, unitPrice: 370, total: 470 };

    doc.fontSize(20).text("INVOICE", { align: "right" });
    doc.fontSize(10).text(`Invoice #${invoice.id}`, { align: "right" });
    doc.text(`Due: ${invoice.due_date}`, { align: "right" });
    doc.moveDown();

    doc.fontSize(12).text(`Bill to: ${client.name}`);
    doc.fontSize(10).text(client.email);
    doc.moveDown();

    // Each column is written with an explicit (x, y) pair and NO
    // 'continued' chaining - this is the actual fix. 'continued: true'
    // is meant for flowing a single line of text with mixed styles
    // (e.g. bold then normal), not for independently-positioned table
    // columns - using it here caused each column's x position to drift
    // based on where the PREVIOUS column's text happened to end, rather
    // than jumping cleanly to the intended x coordinate every time.
    let y = doc.y;
    doc.fontSize(11);
    doc.text("Description", COL.description, y);
    doc.text("Qty", COL.qty, y);
    doc.text("Unit Price", COL.unitPrice, y);
    doc.text("Total", COL.total, y);
    doc.moveDown(0.5);

    let total = 0;
    for (const item of lineItems) {
      const lineTotal = item.quantity * item.unit_price_cents;
      total += lineTotal;
      y = doc.y;
      doc.fontSize(10);
      doc.text(item.description, COL.description, y, { width: COL.qty - COL.description - 10 });
      doc.text(String(item.quantity), COL.qty, y);
      doc.text(`$${(item.unit_price_cents / 100).toFixed(2)}`, COL.unitPrice, y);
      doc.text(`$${(lineTotal / 100).toFixed(2)}`, COL.total, y);
      doc.moveDown(0.5);
    }

    doc.moveDown();
    doc.fontSize(12).text(`Total: $${(total / 100).toFixed(2)}`, { align: "right" });

    doc.end();
  });
}

module.exports = { generateInvoicePdf };