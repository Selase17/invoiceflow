// Thin fetch wrapper around the InvoiceFlow API. Requests are same-origin
// under /api/ in production (nginx strips the prefix and proxies to the API
// container); in dev, vite.config.js proxies /api the same way.
const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // response wasn't JSON — fall back to the status line
    }
    throw new Error(message);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  // Clients
  listClients: () => request("/clients"),
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) =>
    request("/clients", { method: "POST", body: JSON.stringify(data) }),

  // Invoices
  listInvoices: () => request("/invoices"),
  getInvoice: (id) => request(`/invoices/${id}`),
  createInvoice: (data) =>
    request("/invoices", { method: "POST", body: JSON.stringify(data) }),
  sendInvoice: (id) => request(`/invoices/${id}/send`, { method: "POST" }),

  // Expenses
  listExpenses: () => request("/expenses"),
  createExpense: (data) =>
    request("/expenses", { method: "POST", body: JSON.stringify(data) }),
};

export function centsToDisplay(cents) {
  return (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
  });
}
