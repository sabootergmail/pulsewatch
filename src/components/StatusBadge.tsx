type Status = "up" | "down" | "paused" | "unknown" | string;

const styles: Record<string, string> = {
  up: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  down: "bg-red-50 text-red-700 ring-red-600/20",
  paused: "bg-zinc-100 text-zinc-700 ring-zinc-600/20",
  unknown: "bg-amber-50 text-amber-800 ring-amber-600/20",
};

const labels: Record<string, string> = {
  up: "Operational",
  down: "Down",
  paused: "Paused",
  unknown: "Pending",
};

export function StatusBadge({ status }: { status: Status }) {
  const cls = styles[status] ?? styles.unknown;
  const label = labels[status] ?? status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          status === "up"
            ? "bg-emerald-500"
            : status === "down"
              ? "bg-red-500"
              : status === "paused"
                ? "bg-zinc-400"
                : "bg-amber-500"
        }`}
      />
      {label}
    </span>
  );
}
