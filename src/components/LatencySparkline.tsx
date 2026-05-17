export function LatencySparkline({
  checks,
  width = 120,
  height = 28,
}: {
  checks: { status: string; latencyMs: number | null }[];
  width?: number;
  height?: number;
}) {
  if (checks.length === 0) {
    return <div className="text-xs text-zinc-400">No data yet</div>;
  }

  const points = checks.map((c) => c.latencyMs ?? 0);
  const max = Math.max(...points, 1);
  const barWidth = width / Math.max(checks.length, 1);

  return (
    <svg width={width} height={height} className="overflow-visible">
      {checks.map((c, i) => {
        const h = (Math.max(c.latencyMs ?? 0, max * 0.05) / max) * height;
        const fill = c.status === "up" ? "#10b981" : "#ef4444";
        return (
          <rect
            key={i}
            x={i * barWidth}
            y={height - h}
            width={Math.max(barWidth - 1, 1)}
            height={h}
            fill={fill}
            rx={1}
          />
        );
      })}
    </svg>
  );
}
