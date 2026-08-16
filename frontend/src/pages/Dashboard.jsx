import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, centsToDisplay } from "../api.js";
import { Card, PageHeader, Button, Spinner, ErrorBanner } from "../components/ui.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function Dashboard() {
  const [invoices, setInvoices] = useState(null);
  const [clients, setClients] = useState(null);
  const [expenses, setExpenses] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listInvoices(), api.listClients(), api.listExpenses()])
      .then(([inv, cli, exp]) => {
        if (cancelled) return;
        setInvoices(inv);
        setClients(cli);
        setExpenses(exp);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    if (!invoices) return null;
    const sum = (predicate) =>
      invoices.filter(predicate).reduce((acc, inv) => acc + inv.total_cents, 0);
    return {
      outstanding: sum((inv) => inv.status === "sent" || inv.status === "overdue"),
      paid: sum((inv) => inv.status === "paid"),
      overdueCount: invoices.filter((inv) => inv.status === "overdue").length,
      draftCount: invoices.filter((inv) => inv.status === "draft").length,
    };
  }, [invoices]);

  const clientsById = useMemo(() => {
    const map = new Map();
    (clients || []).forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const recentInvoices = useMemo(
    () => (invoices || []).slice(0, 6),
    [invoices],
  );

  const loading = invoices === null || clients === null || expenses === null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="An overview of your invoicing activity."
        actions={
          <Button as={Link} to="/invoices/new">
            + New invoice
          </Button>
        }
      />

      <ErrorBanner message={error} />

      {loading && !error ? (
        <div className="flex items-center gap-2 py-16 text-slate-400">
          <Spinner className="h-5 w-5" />
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Outstanding"
              value={centsToDisplay(stats.outstanding)}
              tone="text-brand-700"
            />
            <StatCard
              label="Paid"
              value={centsToDisplay(stats.paid)}
              tone="text-emerald-700"
            />
            <StatCard label="Overdue" value={stats.overdueCount} tone="text-red-700" />
            <StatCard label="Drafts" value={stats.draftCount} tone="text-slate-700" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Recent invoices
                </h2>
                <Link
                  to="/invoices"
                  className="text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  View all
                </Link>
              </div>
              {recentInvoices.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">
                  No invoices yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {recentInvoices.map((inv) => (
                    <li key={inv.id}>
                      <Link
                        to={`/invoices/${inv.id}`}
                        className="flex items-center justify-between px-5 py-3 hover:bg-slate-50"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {clientsById.get(inv.client_id)?.name ||
                              `Client #${inv.client_id}`}
                          </p>
                          <p className="text-xs text-slate-500">
                            Invoice #{inv.id} · due{" "}
                            {new Date(inv.due_date).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-medium text-slate-900">
                            {centsToDisplay(inv.total_cents)}
                          </span>
                          <StatusBadge status={inv.status} />
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">Snapshot</h2>
              </div>
              <dl className="divide-y divide-slate-100">
                <SnapshotRow label="Clients" value={clients.length} to="/clients" />
                <SnapshotRow label="Invoices" value={invoices.length} to="/invoices" />
                <SnapshotRow
                  label="Expenses"
                  value={expenses.length}
                  to="/expenses"
                />
              </dl>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }) {
  return (
    <Card className="px-5 py-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold ${tone}`}>{value}</p>
    </Card>
  );
}

function SnapshotRow({ label, value, to }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between px-5 py-3 text-sm hover:bg-slate-50"
    >
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </Link>
  );
}
