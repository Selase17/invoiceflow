const STYLES = {
  draft: "bg-slate-100 text-slate-600 ring-slate-500/20",
  sent: "bg-blue-50 text-blue-700 ring-blue-600/20",
  paid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  overdue: "bg-red-50 text-red-700 ring-red-600/20",
};

export default function StatusBadge({ status }) {
  const style = STYLES[status] || STYLES.draft;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${style}`}
    >
      {status}
    </span>
  );
}
