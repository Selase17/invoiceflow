exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("invoice_notes", {
    id: "id",
    invoice_id: { type: "integer", notNull: true, references: "invoices", onDelete: "CASCADE" },
    body: { type: "text", notNull: true },
    created_at: { type: "timestamp", default: pgm.func("now()") },
  });

  pgm.createIndex("invoice_notes", "invoice_id");
};

exports.down = (pgm) => {
  pgm.dropTable("invoice_notes");
};