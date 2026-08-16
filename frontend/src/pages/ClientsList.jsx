import { useEffect, useState } from "react";
import { api } from "../api.js";
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

export default function ClientsList() {
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    return api.listClients().then(setClients).catch((err) => setError(err.message));
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createClient({ name: name.trim(), email: email.trim() });
      setName("");
      setEmail("");
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Clients"
        description="Everyone you bill."
        actions={
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add client"}
          </Button>
        }
      />

      <ErrorBanner message={error} />

      {showForm && (
        <Card className="mb-6 p-5">
          <form
            onSubmit={handleSubmit}
            className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <Field label="Name">
              <input
                required
                type="text"
                className={inputClass}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
              />
            </Field>
            <Field label="Email">
              <input
                required
                type="email"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="billing@acme.com"
              />
            </Field>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save client"}
            </Button>
          </form>
        </Card>
      )}

      {clients === null && !error ? (
        <div className="flex items-center gap-2 py-16 text-slate-400">
          <Spinner className="h-5 w-5" />
          Loading…
        </div>
      ) : clients?.length === 0 ? (
        <EmptyState
          title="No clients yet"
          description="Add a client to start creating invoices for them."
          action={<Button onClick={() => setShowForm(true)}>+ Add client</Button>}
        />
      ) : (
        clients && (
          <Card className="overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Email</th>
                  <th className="px-5 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {c.name}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{c.email}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
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
