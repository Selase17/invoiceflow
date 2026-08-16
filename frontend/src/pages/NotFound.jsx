import { Link } from "react-router-dom";
import { Button } from "../components/ui.jsx";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-sm font-semibold text-brand-600">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        The page you're looking for doesn't exist.
      </p>
      <Button as={Link} to="/" className="mt-6">
        Back to dashboard
      </Button>
    </div>
  );
}
