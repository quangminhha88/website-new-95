type Status = 'draft' | 'pending_review' | 'approved' | 'rejected' | string;

const STYLES: Record<string, string> = {
  approved: 'bg-green-100 text-green-700 ring-green-600/20',
  pending_review: 'bg-amber-100 text-amber-700 ring-amber-600/20',
  draft: 'bg-gray-100 text-gray-600 ring-gray-500/20',
  rejected: 'bg-red-100 text-red-700 ring-red-600/20',
};

const LABELS: Record<string, string> = {
  approved: 'Approved',
  pending_review: 'Pending Review',
  draft: 'Draft',
  rejected: 'Rejected',
};

export default function StatusBadge({ status }: { status: Status }) {
  const cls = STYLES[status] ?? 'bg-gray-100 text-gray-600 ring-gray-500/20';
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}

interface QualityBadgeProps {
  score: number | null | undefined;
}

export function QualityBadge({ score }: QualityBadgeProps) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-gray-400">—</span>;
  }
  const color =
    score >= 85
      ? 'bg-green-100 text-green-700'
      : score >= 75
        ? 'bg-blue-100 text-blue-700'
        : score >= 60
          ? 'bg-amber-100 text-amber-700'
          : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold ${color}`}>
      {score}
    </span>
  );
}
