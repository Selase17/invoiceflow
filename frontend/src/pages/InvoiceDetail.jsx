import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, centsToDisplay } from "../api.js";
import {
  Card,
  PageHeader,
  Button,
  Spinner,
  ErrorBanner,
} from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function InvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [client, setClient] = useState(null);
  const [error, setError] = useState(null);
  const [sendState, setSendState] = useState("idle"); // idle | queued | polling
  const pollRef = useRef(null);

  const load = useCallback(() => {
    return api.getInvoice(id).then((inv) => {
      setInvoice(inv);
      return api
        .getClient(inv.client_id)
        .then(setClient)
        .catch(() => setClient(null));
    });
  }, [id]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => () => clearInterval(pollRef.current), []);

  async function handleSend() {
    setError(null);
    setSendState("queued");
    try {
      await api.sendInvoice(id);
      setSendState("polling");
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const inv = await api.getInvoice(id);
          setInvoice(inv);
          if (inv.status !== "draft" || attempts >= 8) {
            clearInterval(pollRef.current);
            setSendState("idle");
          }
        } catch {
          clearInterval(pollRef.current);
          setSendState("idle");
        }
      }, 1500);
    } catch (err) {
      setError(err.message);
      setSendState("idle");
    }
  }

  if (error && !invoice) {
    return (
      <div>
        <PageHeader title="Invoice" />
        <ErrorBanner message={error} />
        <Button as={Link} to="/invoices" variant="secondary">
          Back to invoices
        </Button>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex items-center gap-2 py-16 text-slate-400">
        <Spinner className="h-5 w-5" />
        Loading…
      </div>
    );
  }

  const canSend = invoice.status === "draft" && sendState === "idle";

  return (
    <div>
      <PageHeader
        title={`Invoice #${invoice.id}`}
        description={client ? `Billed to ${client.name}` : undefined}
        actions={
          <>
            <Button as={Link} to="/invoices" variant="secondary">
              Back
            </Button>
            <Button onClick={handleSend} disabled={!canSend}>
              {sendState === "queued" && "Queuing…"}
              {sendState === "polling" && "Sending…"}
              {sendState === "idle" &&
                (invoice.status === "draft" ? "Send invoice" : "Sent")}
            </Button>
          </>
        }
      />

      <ErrorBanner message={error} />

      {sendState !== "idle" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700 ring-1 ring-inset ring-brand-600/10">
          <Spinner className="h-4 w-4" />
          Invoice queued for delivery — generating PDF and emailing the client.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit price</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoice.line_items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3 text-slate-900">{item.description}</td>
                  <td className="py-3 text-right text-slate-600">
                    {item.quantity}
                  </td>
                  <td className="py-3 text-right text-slate-600">
                    {centsToDisplay(item.unit_price_cents)}
                  </td>
                  <td className="py-3 text-right font-medium text-slate-900">
                    {centsToDisplay(item.unit_price_cents * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
            <div className="text-right">
              <p className="text-xs text-slate-500">Total due</p>
              <p className="text-xl font-semibold text-slate-900">
                {centsToDisplay(invoice.total_cents)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Details</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Status">
              <StatusBadge status={invoice.status} />
            </Row>
            <Row label="Client">
              {client ? (
                <Link
                  to="/clients"
                  className="font-medium text-brand-600 hover:text-brand-700"
                >
                  {client.name}
                </Link>
              ) : (
                `#${invoice.client_id}`
              )}
            </Row>
            <Row label="Due date">
              {new Date(invoice.due_date).toLocaleDateString()}
            </Row>
            <Row label="Created">
              {new Date(invoice.created_at).toLocaleDateString()}
            </Row>
            {invoice.sent_at && (
              <Row label="Sent">
                {new Date(invoice.sent_at).toLocaleString()}
              </Row>
            )}
            {invoice.paid_at && (
              <Row label="Paid">
                {new Date(invoice.paid_at).toLocaleString()}
              </Row>
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{children}</dd>
    </div>
  );
}
