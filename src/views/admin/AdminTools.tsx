import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SkeletonRow } from '@/components/Skeleton';
import { useUIStore } from '@/stores/ui';
import { logAuditBulk } from '@/lib/audit-log';
import type { Tool, ModerationStatus } from '@/types/tool';

const STATUS_COLORS: Record<ModerationStatus, string> = {
  approved: 'bg-green-100 text-green-700',
  pending_review: 'bg-orange-100 text-orange-700',
  rejected: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-700',
};

interface ToolRow extends Pick<Tool, 'id' | 'name' | 'slug' | 'moderation_status' | 'quality_score' | 'updated_at'> {}

async function fetchTools(filter: ModerationStatus | 'all'): Promise<ToolRow[]> {
  let query = supabase
    .from('tools')
    .select('id, name, slug, moderation_status, quality_score, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (filter !== 'all') query = query.eq('moderation_status', filter);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ToolRow[];
}

export default function AdminTools() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ModerationStatus | 'all'>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pushToast = useUIStore((s) => s.pushToast);
  const qc = useQueryClient();

  const { data: tools, isLoading } = useQuery({
    queryKey: ['admin', 'tools', filter],
    queryFn: () => fetchTools(filter),
  });

  const filtered = useMemo(() => {
    if (!tools) return [];
    if (!search) return tools;
    const needle = search.toLowerCase();
    return tools.filter((t) => t.name.toLowerCase().includes(needle) || t.slug.includes(needle));
  }, [tools, search]);

  const bulkApprove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('tools')
        .update({ moderation_status: 'approved', reviewed_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;

      // Audit trail — fire-and-forget, won't block on failure
      const slugMap = new Map(tools?.map((t) => [t.id, t.slug]) ?? []);
      void logAuditBulk(
        ids.map((id) => ({
          resource_type: 'tool' as const,
          resource_id: id,
          resource_slug: slugMap.get(id),
          action: 'approved' as const,
          notes: 'bulk-approve',
        })),
      );
    },
    onSuccess: (_, ids) => {
      pushToast(`Approved ${ids.length} tool(s)`, 'success');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['admin', 'tools'] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Failed', 'error'),
  });

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((t) => t.id)));
    }
  }

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tools</h1>
          <p className="mt-1 text-sm text-gray-500">{tools?.length ?? '…'} tools</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="search"
              placeholder="Search by name or slug…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as ModerationStatus | 'all')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All statuses</option>
            <option value="approved">Approved</option>
            <option value="pending_review">Pending Review</option>
            <option value="draft">Draft</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3">
          <p className="text-sm text-indigo-900">
            <strong>{selected.size}</strong> selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => bulkApprove.mutate(Array.from(selected))}
              disabled={bulkApprove.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Bulk approve
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Quality</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
              : filtered.map((tool) => (
                  <tr key={tool.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(tool.id)}
                        onChange={() => toggleSelect(tool.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={`/tools/${tool.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-gray-900 hover:text-indigo-600"
                      >
                        {tool.name}
                      </a>
                      <p className="text-xs text-gray-500">/{tool.slug}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_COLORS[tool.moderation_status ?? 'approved']
                        }`}
                      >
                        {tool.moderation_status ?? 'approved'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {tool.quality_score != null ? (
                        <span
                          className={`font-medium ${
                            tool.quality_score >= 75 ? 'text-green-600' : 'text-orange-600'
                          }`}
                        >
                          {tool.quality_score}/100
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {tool.updated_at ? new Date(tool.updated_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
