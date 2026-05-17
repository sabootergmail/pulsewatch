export function formatRelative(date: Date | null | undefined): string {
  if (!date) return "never";
  const diffMs = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hrs = Math.floor(min / 60);
  return `${hrs}h ${min % 60}m`;
}

export function uptimePercentage(upChecks: number, totalChecks: number): number {
  if (totalChecks === 0) return 100;
  return Math.round((upChecks / totalChecks) * 10000) / 100;
}
