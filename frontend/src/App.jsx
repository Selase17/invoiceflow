import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import InvoicesList from "./pages/InvoicesList.jsx";
import InvoiceNew from "./pages/InvoiceNew.jsx";
import InvoiceDetail from "./pages/InvoiceDetail.jsx";
import ClientsList from "./pages/ClientsList.jsx";
import ExpensesList from "./pages/ExpensesList.jsx";
import NotFound from "./pages/NotFound.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="invoices" element={<InvoicesList />} />
        <Route path="invoices/new" element={<InvoiceNew />} />
        <Route path="invoices/:id" element={<InvoiceDetail />} />
        <Route path="clients" element={<ClientsList />} />
        <Route path="expenses" element={<ExpensesList />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
