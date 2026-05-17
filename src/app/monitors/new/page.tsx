import Link from "next/link";
import { createMonitor } from "@/lib/actions";

export default function NewMonitorPage() {
  return (
    <div className="max-w-xl">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">&larr; back</Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">New monitor</h1>
      <p className="text-sm text-zinc-500 mt-1">
        Configure an HTTP endpoint to watch. We&apos;ll probe it on the chosen interval.
      </p>

      <form action={createMonitor} className="mt-6 space-y-4 bg-white border border-zinc-200 rounded-lg p-6">
        <Field label="Name" name="name" placeholder="My API" required />
        <Field label="URL" name="url" placeholder="https://example.com/health" type="url" required />

        <div className="grid grid-cols-2 gap-4">
          <Select label="Method" name="method" options={["GET", "HEAD", "POST"]} defaultValue="GET" />
          <Field label="Expected status" name="expectedStatus" type="number" defaultValue="200" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Interval (seconds)" name="intervalSeconds" type="number" defaultValue="60" />
          <Field label="Timeout (ms)" name="timeoutMs" type="number" defaultValue="5000" />
        </div>

        <div className="pt-2 flex items-center justify-end gap-2">
          <Link
            href="/"
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Create monitor
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  ...rest
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-700 mb-1">{label}</span>
      <input
        name={name}
        type={type}
        className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none"
        {...rest}
      />
    </label>
  );
}

function Select({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-zinc-700 mb-1">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="block w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm shadow-sm focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
