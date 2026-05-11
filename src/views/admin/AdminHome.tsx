import { useQuery } from '@tanstack/react-query';
import { Database, FileText, ListChecks, AlertTriangle, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/Skeleton';

interface Counts {
  totalTools: number;
  totalNiches: number;
  pendingReview: number;
  lowQuality: number;
  totalImpressionsLast7d: number;
  totalClicksLast7d: number;
}

async function fetchCounts(): Promise<Counts> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [tools, niches, pending, low, impressions, clicks] = await Promise.all([
    supabase.from('tools').select('*', { count: 'exact', head: true }),
    supabase.from('niche_pages').select('*', { count: 'exact', head: true }),
    supabase
      .from('tools')
      .select('*', { count: 'exact', head: true })
      .eq('moderation_status', 'pending_review'),
    supabase
      .from('tools')
      .select('*', { count: 'exact', head: true })
      .lt('quality_score', 75),
    supabase
      .from('seo_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'impression')
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('seo_metrics')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'affiliate_click')
      .gte('created_at', sevenDaysAgo),
  ]);

  return {
    totalTools: tools.count ?? 0,
    totalNiches: niches.count ?? 0,
    pendingReview: pending.count ?? 0,
    lowQuality: low.count ?? 0,
    totalImpressionsLast7d: impressions.count ?? 0,
    totalClicksLast7d: clicks.count ?? 0,
  };
}

export default function AdminHome() {
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'counts'], queryFn: fetchCounts });

  const ctr =
    data && data.totalImpressionsLast7d > 0
      ? ((data.totalClicksLast7d / data.totalImpressionsLast7d) * 100).toFixed(2)
      : '0.00';

  const cards = [
    { label: 'Total Tools', value: data?.totalTools, icon: Database, color: 'indigo' },
    { label: 'Niche Pages', value: data?.totalNiches, icon: FileText, color: 'blue' },
    { label: 'Pending Review', value: data?.pendingReview, icon: ListChecks, color: 'orange', link: '/admin/review' },
    { label: 'Low Quality (<75)', value: data?.lowQuality, icon: AlertTriangle, color: 'red', link: '/admin/review' },
  ];

  return (
    <div className="px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Overview of your SaaS directory</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => {
          const inner = (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-${c.color}-100 text-${c.color}-600`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-500">{c.label}</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-gray-900">{c.value}</p>
                )}
              </div>
            </div>
          );
          return c.link ? (
            <Link key={c.label} href={c.link}>{inner}</Link>
          ) : (
            <div key={c.label}>{inner}</div>
          );
        })}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">7-Day Impressions</p>
          {isLoading ? (
            <Skeleton className="h-8 w-24 mt-2" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {data?.totalImpressionsLast7d.toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">7-Day Affiliate Clicks</p>
          {isLoading ? (
            <Skeleton className="h-8 w-24 mt-2" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {data?.totalClicksLast7d.toLocaleString()}
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Site-wide CTR</p>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </div>
          {isLoading ? (
            <Skeleton className="h-8 w-24 mt-2" />
          ) : (
            <p className="text-2xl font-bold text-gray-900 mt-1">{ctr}%</p>
          )}
        </div>
      </div>

      <RecentActivity />
    </div>
  );
}

// ── Recent admin activity (audit log feed) ────────────────────────────

interface AuditFeedRow {
  id: number;
  action: string;
  resource_type: string;
  resource_slug: string | null;
  actor_email: string | null;
  notes: string | null;
  created_at: string;
}

function RecentActivity() {
  const { data, isLoading } = useQuery<AuditFeedRow[]>({
    queryKey: ['admin', 'audit-feed'],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_audit_logs')
        .select('id, action, resource_type, resource_slug, actor_email, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as AuditFeedRow[];
    },
  });

  return (
    <div className="mt-8 rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="font-bold text-gray-900">Recent admin activity</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Last 15 mutations across tools, niche pages, and reviews
        </p>
      </div>
      {isLoading ? (
        <div className="p-6 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">
          No activity yet. Mutations will appear here as editors approve, reject, or edit content.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {data.map((row) => (
            <li key={row.id} className="px-6 py-3 flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium capitalize">{row.action.replace(/_/g, ' ')}</span>
                <span className="text-gray-500"> · {row.resource_type}</span>
                {row.resource_slug && (
                  <span className="text-gray-700 ml-1">/{row.resource_slug}</span>
                )}
                {row.notes && (
                  <span className="text-xs text-gray-500 ml-2 italic truncate">"{row.notes}"</span>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500">
                {row.actor_email && <span className="truncate max-w-[160px]">{row.actor_email}</span>}
                <time>{new Date(row.created_at).toLocaleString()}</time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
