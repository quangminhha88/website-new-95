import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: number; positive?: boolean };
  hint?: string;
}

export default function StatCard({ label, value, icon: Icon, trend, hint }: StatCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="text-sm font-medium text-gray-500">{label}</div>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-50 text-gray-500">
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-3xl font-bold text-gray-900">{value}</div>
        {trend && (
          <span
            className={`text-xs font-semibold ${
              trend.positive ?? trend.value >= 0 ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}%
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  );
}
