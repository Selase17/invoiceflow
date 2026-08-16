import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, centsToDisplay } from "../api.js";
import {
  Card,
  PageHeader,
  Button,
  Field,
  inputClass,
  ErrorBanner,
  Spinner,
} from "../components/ui.jsx";

function emptyLine() {
  return { description: "", quantity: 1, unit_price: "" };
}

export default function InvoiceNew() {
  const navigate = useNavigate();
  const [clients, setClients] = useState(null);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listClients()
      .then((cli) => {
        setClients(cli);
        if (cli.length > 0) setClientId(String(cli[0].id));
      })
      .catch((err) => setError(err.message));
  }, []);

  const total = useMemo(
    () =>
      lines.reduce((acc, line) => {
        const qty = Number(line.quantity) || 0;
        const price = Math.round((Number(line.unit_price) || 0) * 100);
        return acc + qty * price;
      }, 0),
    [lines],
  );

  function updateLine(index, patch) {
    setLines((prev) =>
      prev.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!clientId) {
      setError("Choose a client.");
      return;
    }
    const line_items = lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unit_price_cents: Math.round((Number(l.unit_price) || 0) * 100),
      }));
    if (line_items.length === 0) {
      setError("Add at least one line item.");
      return;
    }

    setSubmitting(true);
    try {
      const invoice = await api.createInvoice({
        client_id: Number(clientId),
        due_date: dueDate,
        line_items,
      });
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (clients === null) {
    return (
      <div className="flex items-center gap-2 py-16 text-slate-400">
        <Spinner className="h-5 w-5" />
        Loading…
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <div>
        <PageHeader title="New invoice" />
        <Card className="px-6 py-10 text-center">
          <p className="text-sm text-slate-600">
            You need at least one client before creating an invoice.
          </p>
          <Button as={Link} to="/clients" className="mt-4">
            Add a client
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="New invoice" description="Bill a client for work done." />
      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Client">
              <select
                className={inputClass}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                required
                className={inputClass}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
            <Button type="button" variant="secondary" onClick={addLine}>
              + Add line
            </Button>
          </div>

          <div className="space-y-3">
            {lines.map((line, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_90px_120px_110px_auto] sm:items-end"
              >
                <Field label="Description">
                  <input
                    type="text"
                    className={inputClass}
                    value={line.description}
                    onChange={(e) => updateLine(i, { description: e.target.value })}
                    placeholder="Consulting services"
                  />
                </Field>
                <Field label="Qty">
                  <input
                    type="number"
                    min="0"
                    step="1"
                    className={inputClass}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                  />
                </Field>
                <Field label="Unit price">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={line.unit_price}
                    onChange={(e) => updateLine(i, { unit_price: e.target.value })}
                    placeholder="0.00"
                  />
                </Field>
                <Field label="Line total">
                  <div className="flex h-[38px] items-center text-sm font-medium text-slate-700">
                    {centsToDisplay(
                      Math.round(
                        (Number(line.quantity) || 0) *
                          (Number(line.unit_price) || 0) *
                          100,
                      ),
                    )}
                  </div>
                </Field>
                <button
                  type="button"
                  onClick={() => removeLine(i)}
                  disabled={lines.length === 1}
                  className="rounded-md px-2 py-2 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
            <div className="text-right">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-xl font-semibold text-slate-900">
                {centsToDisplay(total)}
              </p>
            </div>
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Button as={Link} to="/invoices" variant="secondary">
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating…" : "Create invoice"}
          </Button>
        </div>
      </form>
    </div>
  );
}
