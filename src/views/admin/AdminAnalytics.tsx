import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { TrendingUp, MousePointerClick, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/Skeleton';

interface DailyMetric {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface TopPage {
  resource_slug: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

async function fetchAnalytics(): Promise<{ daily: DailyMetric[]; topPages: TopPage[] }> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: events, error } = await supabase
    .from('seo_metrics')
    .select('event_type, resource_slug, created_at')
    .gte('created_at', since)
    .in('event_type', ['impression', 'affiliate_click']);
  if (error) throw error;

  // Aggregate by day
  const byDay: Record<string, { impressions: number; clicks: number }> = {};
  const bySlug: Record<string, { impressions: number; clicks: number }> = {};

  for (const ev of events ?? []) {
    const day = (ev.created_at as string).slice(0, 10);
    byDay[day] = byDay[day] ?? { impressions: 0, clicks: 0 };
    if (ev.event_type === 'impression') byDay[day].impressions++;
    else byDay[day].clicks++;

    if (ev.resource_slug) {
      bySlug[ev.resource_slug] = bySlug[ev.resource_slug] ?? { impressions: 0, clicks: 0 };
      if (ev.event_type === 'impression') bySlug[ev.resource_slug].impressions++;
      else bySlug[ev.resource_slug].clicks++;
    }
  }

  const daily = Object.entries(byDay)
    .map(([date, m]) => ({
      date,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.impressions > 0 ? Number(((m.clicks / m.impressions) * 100).toFixed(2)) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const topPages = Object.entries(bySlug)
    .map(([resource_slug, m]) => ({
      resource_slug,
      impressions: m.impressions,
      clicks: m.clicks,
      ctr: m.impressions > 0 ? Number(((m.clicks / m.impressions) * 100).toFixed(2)) : 0,
    }))
    .filter((p) => p.impressions >= 10) // ignore noisy long-tail
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);

  return { daily, topPages };
}

export default function AdminAnalytics() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics'],
    queryFn: fetchAnalytics,
    staleTime: 60 * 1000,
  });

  const totalImpressions = data?.daily.reduce((s, d) => s + d.impressions, 0) ?? 0;
  const totalClicks = data?.daily.reduce((s, d) => s + d.clicks, 0) ?? 0;
  const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Last 30 days of SEO performance</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-6">
        <StatCard
          icon={Eye}
          label="Total Impressions"
          value={isLoading ? null : totalImpressions.toLocaleString()}
          color="blue"
        />
        <StatCard
          icon={MousePointerClick}
          label="Affiliate Clicks"
          value={isLoading ? null : totalClicks.toLocaleString()}
          color="green"
        />
        <StatCard
          icon={TrendingUp}
          label="Avg CTR"
          value={isLoading ? null : `${avgCtr}%`}
          color="indigo"
        />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
        <h3 className="font-bold text-gray-900 mb-4">Impressions vs Clicks (30 days)</h3>
        {isLoading ? (
          <Skeleton className="h-72" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data?.daily ?? []}>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="impressions"
                name="Impressions"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="clicks"
                name="Clicks"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 p-6">
          <h3 className="font-bold text-gray-900">Top 10 Pages</h3>
        </div>
        {isLoading ? (
          <div className="p-6 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Page</th>
                <th className="px-6 py-3 text-right">Impressions</th>
                <th className="px-6 py-3 text-right">Clicks</th>
                <th className="px-6 py-3 text-right">CTR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.topPages.map((p) => (
                <tr key={p.resource_slug} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">/{p.resource_slug}</td>
                  <td className="px-6 py-3 text-right">{p.impressions.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right">{p.clicks.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right font-semibold text-indigo-600">
                    {p.ctr}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${color}-100 text-${color}-600`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      {value === null ? (
        <Skeleton className="h-8 w-24 mt-1" />
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
    </div>
  );
}
