import { useQuery } from '@tanstack/react-query';
import { DollarSign, TrendingUp, Target } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/Skeleton';

interface RevenueRow {
  tool_slug: string;
  name: string;
  clicks_30d: number;
  conversions_30d: number;
  revenue_30d: number;
  epc: number;
  confidence: number;
}

async function fetchRevenue() {
  const { data: epc } = await supabase
    .from('tool_epc')
    .select('tool_id, tool_slug, clicks_30d, conversions_30d, revenue_30d, epc, confidence')
    .order('revenue_30d', { ascending: false })
    .limit(20);

  if (!epc || epc.length === 0) return { rows: [] as RevenueRow[], totals: null };

  const { data: tools } = await supabase
    .from('tools')
    .select('id, name')
    .in(
      'id',
      epc.map((e: any) => e.tool_id),
    );

  const rows: RevenueRow[] = epc.map((e: any) => ({
    tool_slug: e.tool_slug,
    name: tools?.find((t: any) => t.id === e.tool_id)?.name ?? e.tool_slug,
    clicks_30d: e.clicks_30d,
    conversions_30d: e.conversions_30d,
    revenue_30d: e.revenue_30d,
    epc: e.epc,
    confidence: e.confidence,
  }));

  const totalRevenue = rows.reduce((s, r) => s + r.revenue_30d, 0);
  const totalClicks = rows.reduce((s, r) => s + r.clicks_30d, 0);
  const totalConv = rows.reduce((s, r) => s + r.conversions_30d, 0);
  const avgEPC = totalClicks > 0 ? totalRevenue / totalClicks : 0;

  return {
    rows,
    totals: {
      revenue: totalRevenue,
      clicks: totalClicks,
      conversions: totalConv,
      avgEPC,
      conversionRate: totalClicks > 0 ? (totalConv / totalClicks) * 100 : 0,
    },
  };
}

export default function AdminRevenue() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'revenue'],
    queryFn: fetchRevenue,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Revenue Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">
          Last 30 days — run <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">npm run epc</code> to refresh
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 mb-6">
        <Stat icon={DollarSign} label="Revenue (30d)" value={data?.totals ? `$${data.totals.revenue.toFixed(2)}` : null} color="green" loading={isLoading} />
        <Stat icon={Target} label="Conversions" value={data?.totals?.conversions.toLocaleString() ?? null} color="blue" loading={isLoading} />
        <Stat icon={TrendingUp} label="Avg EPC" value={data?.totals ? `$${data.totals.avgEPC.toFixed(3)}` : null} color="indigo" loading={isLoading} />
        <Stat icon={Target} label="Conv Rate" value={data?.totals ? `${data.totals.conversionRate.toFixed(2)}%` : null} color="purple" loading={isLoading} />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm mb-6">
        <h3 className="font-bold text-gray-900 mb-4">Top Earners (Revenue 30d)</h3>
        {isLoading ? (
          <Skeleton className="h-72" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data?.rows.slice(0, 10) ?? []}>
              <CartesianGrid stroke="#f3f4f6" strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-15} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="revenue_30d" name="Revenue ($)" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 p-6">
          <h3 className="font-bold text-gray-900">Per-Tool Performance</h3>
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
                <th className="px-6 py-3">Tool</th>
                <th className="px-6 py-3 text-right">Clicks</th>
                <th className="px-6 py-3 text-right">Conv.</th>
                <th className="px-6 py-3 text-right">Revenue</th>
                <th className="px-6 py-3 text-right">EPC</th>
                <th className="px-6 py-3 text-right">Conf.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.rows.map((r) => (
                <tr key={r.tool_slug} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{r.name}</td>
                  <td className="px-6 py-3 text-right">{r.clicks_30d.toLocaleString()}</td>
                  <td className="px-6 py-3 text-right">{r.conversions_30d}</td>
                  <td className="px-6 py-3 text-right font-semibold text-green-600">
                    ${r.revenue_30d.toFixed(2)}
                  </td>
                  <td className="px-6 py-3 text-right">${r.epc.toFixed(3)}</td>
                  <td className="px-6 py-3 text-right">{(r.confidence * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  color,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | null;
  color: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${color}-100 text-${color}-600`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium text-gray-500">{label}</p>
      {loading || value === null ? (
        <Skeleton className="h-8 w-24 mt-1" />
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
    </div>
  );
}
