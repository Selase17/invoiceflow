// src/logger.js
function log(level, event, fields = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    service: process.env.SERVICE_NAME || "invoiceflow-api",
    ...fields,
  };
  console.log(JSON.stringify(entry));
}

module.exports = {
  info: (event, fields) => log("INFO", event, fields),
  warn: (event, fields) => log("WARNING", event, fields),
  error: (event, fields) => log("ERROR", event, fields),
};
