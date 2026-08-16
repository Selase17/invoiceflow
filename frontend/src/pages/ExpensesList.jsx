import { useEffect, useMemo, useState } from "react";
import { api, centsToDisplay } from "../api.js";
import {
  Card,
  PageHeader,
  Button,
  Field,
  inputClass,
  ErrorBanner,
  EmptyState,
  Spinner,
} from "../components/ui.jsx";

function emptyForm() {
  return { client_id: "", description: "", amount: "", incurred_on: "" };
}

export default function ExpensesList() {
  const [expenses, setExpenses] = useState(null);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    return Promise.all([api.listExpenses(), api.listClients()])
      .then(([exp, cli]) => {
        setExpenses(exp);
        setClients(cli);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(() => {
    refresh();
  }, []);

  const clientsById = useMemo(() => {
    const map = new Map();
    (clients || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createExpense({
        client_id: form.client_id ? Number(form.client_id) : null,
        description: form.description.trim(),
        amount_cents: Math.round((Number(form.amount) || 0) * 100),
        incurred_on: form.incurred_on,
      });
      setForm(emptyForm());
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const total = useMemo(
    () => (expenses || []).reduce((acc, e) => acc + e.amount_cents, 0),
    [expenses],
  );

  return (
    <div>
      <PageHeader
        title="Expenses"
        description={
          expenses && expenses.length > 0
            ? `${expenses.length} recorded · ${centsToDisplay(total)} total`
            : "Track costs, optionally tied to a client."
        }
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add expense"}
          </Button>
        }
      />

      <ErrorBanner message={error} />

      {showForm && (
        <Card className="mb-6 p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Description">
                <input
                  required
                  type="text"
                  className={inputClass}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="AWS hosting"
                />
              </Field>
              <Field label="Client (optional)">
                <select
                  className={inputClass}
                  value={form.client_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, client_id: e.target.value }))
                  }
                >
                  <option value="">— None —</option>
                  {(clients || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Amount">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="0.00"
                />
              </Field>
              <Field label="Date incurred">
                <input
                  required
                  type="date"
                  className={inputClass}
                  value={form.incurred_on}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, incurred_on: e.target.value }))
                  }
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save expense"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {expenses === null && !error ? (
        <div className="flex items-center gap-2 py-16 text-slate-400">
          <Spinner className="h-5 w-5" />
          Loading…
        </div>
      ) : expenses?.length === 0 ? (
        <EmptyState
          title="No expenses yet"
          description="Record a cost to keep track of what you're spending."
          action={<Button onClick={() => setShowForm(true)}>+ Add expense</Button>}
        />
      ) : (
        expenses && (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Incurred</th>
                  <th className="px-5 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {e.description}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {e.client_id
                        ? clientsById.get(e.client_id)?.name ||
                          `Client #${e.client_id}`
                        : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {new Date(e.incurred_on).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-slate-900">
                      {centsToDisplay(e.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )
      )}
    </div>
  );
}
