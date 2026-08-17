exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable("clients", {
    id: "id",
    name: { type: "text", notNull: true },
    email: { type: "text", notNull: true },
    created_at: { type: "timestamp", default: pgm.func("now()") },
  });

  pgm.createTable("invoices", {
    id: "id",
    client_id: { type: "integer", notNull: true, references: "clients" },
    status: { type: "text", notNull: true, default: "draft" },
    due_date: { type: "date", notNull: true },
    total_cents: { type: "integer", notNull: true, default: 0 },
    sent_at: { type: "timestamp" },
    paid_at: { type: "timestamp" },
    created_at: { type: "timestamp", default: pgm.func("now()") },
  });

  pgm.createTable("invoice_line_items", {
    id: "id",
    invoice_id: { type: "integer", notNull: true, references: "invoices", onDelete: "CASCADE" },
    description: { type: "text", notNull: true },
    quantity: { type: "integer", notNull: true, default: 1 },
    unit_price_cents: { type: "integer", notNull: true },
  });

  pgm.createTable("expenses", {
    id: "id",
    client_id: { type: "integer", references: "clients" },
    description: { type: "text", notNull: true },
    amount_cents: { type: "integer", notNull: true },
    incurred_on: { type: "date", notNull: true },
    created_at: { type: "timestamp", default: pgm.func("now()") },
  });

  pgm.createIndex("invoices", "status");
  pgm.createIndex("invoices", "due_date");
};

exports.down = (pgm) => {
  pgm.dropTable("expenses");
  pgm.dropTable("invoice_line_items");
  pgm.dropTable("invoices");
  pgm.dropTable("clients");
};