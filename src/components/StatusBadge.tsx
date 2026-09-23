import type { JobStatus } from "@/lib/types";

const COLORS: Record<JobStatus, string> = {
  queued: "bg-zinc-700 text-zinc-100",
  submitted: "bg-blue-900 text-blue-100",
  processing: "bg-indigo-900 text-indigo-100",
  completed: "bg-emerald-900 text-emerald-100",
  failed: "bg-red-900 text-red-100",
  canceled: "bg-zinc-800 text-zinc-300",
};

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>{status}</span>
  );
}
