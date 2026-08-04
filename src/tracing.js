// src/tracing.js
const { NodeSDK } = require("@opentelemetry/sdk-node");
const { getNodeAutoInstrumentations } = require("@opentelemetry/auto-instrumentations-node");
const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-grpc");
const { Resource } = require("@opentelemetry/resources");
const { ATTR_SERVICE_NAME } = require("@opentelemetry/semantic-conventions");

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://jaeger:4317",
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: process.env.SERVICE_NAME || "invoiceflow",
  }),
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().finally(() => process.exit(0));
});

module.exports = sdk;