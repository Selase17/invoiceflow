import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, centsToDisplay } from "../api.js";
import {
  Card,
  PageHeader,
  Button,
  Spinner,
  ErrorBanner,
  EmptyState,
} from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const FILTERS = ["all", "draft", "sent", "paid", "overdue"];

export default function InvoicesList() {
  const [invoices, setInvoices] = useState(null);
  const [clients, setClients] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listInvoices(), api.listClients()])
      .then(([inv, cli]) => {
        if (cancelled) return;
        setInvoices(inv);
        setClients(cli);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const clientsById = useMemo(() => {
    const map = new Map();
    (clients || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    if (filter === "all") return invoices;
    return invoices.filter((inv) => inv.status === filter);
  }, [invoices, filter]);

  const loading = invoices === null || clients === null;

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="All invoices across every client."
        actions={
          <Button as={Link} to="/invoices/new">
            + New invoice
          </Button>
        }
      />

      <ErrorBanner message={error} />

      <div className="mb-4 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
              filter === f
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading && !error ? (
        <div className="flex items-center gap-2 py-16 text-slate-400">
          <Spinner className="h-5 w-5" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No invoices found"
          description={
            filter === "all"
              ? "Create your first invoice to get started."
              : `No invoices with status "${filter}".`
          }
          action={
            <Button as={Link} to="/invoices/new">
              + New invoice
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">Client</th>
                <th className="px-5 py-3 font-medium">Due date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      to={`/invoices/${inv.id}`}
                      className="font-medium text-brand-600 hover:text-brand-700"
                    >
                      #{inv.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-slate-700">
                    {clientsById.get(inv.client_id)?.name ||
                      `Client #${inv.client_id}`}
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {new Date(inv.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-slate-900">
                    {centsToDisplay(inv.total_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
