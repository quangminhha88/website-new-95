/**
 * Niche Pages admin — list, search, edit moderation status, soft-delete.
 *
 * Full CRUD via TanStack Query mutations. Edit-in-dialog pattern: clicking
 * a row opens a Sheet with the editable fields (title, meta, status). Saves
 * use `useMutation` and invalidate the list query so the table updates
 * without a manual refetch.
 *
 * Pattern matches AdminTools.tsx — copy/paste a template for AdminCategories.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, ExternalLink, Pencil, Trash2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useUIStore } from '@/stores/ui';
import { logAuditEvent } from '@/lib/audit-log';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SkeletonRow } from '@/components/Skeleton';
import type { ModerationStatus, NichePage } from '@/types/tool';

type NicheRow = Pick<
  NichePage,
  | 'id'
  | 'niche_name'
  | 'slug'
  | 'seo_title'
  | 'seo_meta_description'
  | 'moderation_status'
  | 'quality_score'
  | 'created_at'
>;

const STATUS_VARIANTS: Record<ModerationStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  approved: 'success',
  pending_review: 'warning',
  rejected: 'destructive',
  draft: 'secondary',
};

async function fetchNichePages(filter: ModerationStatus | 'all'): Promise<NicheRow[]> {
  let q = supabase
    .from('niche_pages')
    .select(
      'id, niche_name, slug, seo_title, seo_meta_description, moderation_status, quality_score, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (filter !== 'all') q = q.eq('moderation_status', filter);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as NicheRow[];
}

export default function AdminNichePages() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ModerationStatus | 'all'>('all');
  const [editing, setEditing] = useState<NicheRow | null>(null);
  const [deleting, setDeleting] = useState<NicheRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'niche-pages', filter],
    queryFn: () => fetchNichePages(filter),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const q = search.toLowerCase();
    return data.filter(
      (n) => n.niche_name.toLowerCase().includes(q) || n.slug.includes(q),
    );
  }, [data, search]);

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Niche Pages</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? `${data.length} pages` : 'Loading…'}
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/niche-pages/new">
            <Plus className="h-4 w-4" />
            New page
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search by name or slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as ModerationStatus | 'all')}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending_review">Pending Review</option>
          <option value="draft">Draft</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {error && (
        <Card className="mb-4 border-destructive/30">
          <CardContent className="p-4 text-sm text-destructive">
            Failed to load niche pages: {error.message}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Niche</TableHead>
                <TableHead className="hidden sm:table-cell">SEO Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Quality</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                : filtered.length === 0
                  ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                        {search ? `No matches for "${search}"` : 'No niche pages yet.'}
                      </TableCell>
                    </TableRow>
                  )
                  : filtered.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">{row.niche_name}</div>
                          <div className="text-xs text-muted-foreground">/{row.slug}</div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground line-clamp-1 max-w-md">
                          {row.seo_title ?? <span className="italic">— not set —</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[row.moderation_status ?? 'approved']}>
                            {row.moderation_status ?? 'approved'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {row.quality_score != null ? (
                            <span
                              className={
                                row.quality_score >= 75
                                  ? 'font-medium text-green-600'
                                  : 'font-medium text-orange-600'
                              }
                            >
                              {row.quality_score}/100
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild variant="ghost" size="icon" title="Open public page">
                              <a
                                href={`/best/${row.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setEditing(row)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleting(row)}
                              title="Delete"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit drawer */}
      <EditSheet niche={editing} onClose={() => setEditing(null)} />

      {/* Delete confirm dialog */}
      <DeleteDialog niche={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

// ── Edit drawer ─────────────────────────────────────────────────────────

function EditSheet({ niche, onClose }: { niche: NicheRow | null; onClose: () => void }) {
  // Render the form with `key={niche.id}` so it remounts (fresh state)
  // every time the user picks a different row. Avoids any useEffect dance.
  return (
    <Sheet open={!!niche} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit niche page</SheetTitle>
        </SheetHeader>
        {niche && <EditForm key={niche.id} niche={niche} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function EditForm({ niche, onClose }: { niche: NicheRow; onClose: () => void }) {
  const qc = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);

  const [title, setTitle] = useState(niche.seo_title ?? '');
  const [meta, setMeta] = useState(niche.seo_meta_description ?? '');
  const [status, setStatus] = useState<ModerationStatus>(
    niche.moderation_status ?? 'approved',
  );

  const update = useMutation({
    mutationFn: async () => {
      const changes: Record<string, [unknown, unknown]> = {};
      if ((niche.seo_title ?? '') !== title) changes.seo_title = [niche.seo_title, title];
      if ((niche.seo_meta_description ?? '') !== meta) changes.seo_meta_description = [niche.seo_meta_description, meta];
      if ((niche.moderation_status ?? 'approved') !== status) changes.moderation_status = [niche.moderation_status, status];

      const { error } = await supabase
        .from('niche_pages')
        .update({
          seo_title: title || null,
          seo_meta_description: meta || null,
          moderation_status: status,
        })
        .eq('id', niche.id);
      if (error) throw error;

      void logAuditEvent({
        resource_type: 'niche_page',
        resource_id: niche.id,
        resource_slug: niche.slug,
        action: 'updated',
        changes,
      });
    },
    onSuccess: () => {
      pushToast('Niche page updated', 'success');
      qc.invalidateQueries({ queryKey: ['admin', 'niche-pages'] });
      onClose();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Update failed', 'error'),
  });

  return (
    <div className="mt-6 space-y-4">
      <div className="text-xs text-muted-foreground">
        Slug: <code className="rounded bg-muted px-1.5 py-0.5">/{niche.slug}</code>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo-title">SEO Title</Label>
        <Input
          id="seo-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={70}
        />
        <p className="text-xs text-muted-foreground">{title.length}/70 characters</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo-meta">Meta Description</Label>
        <textarea
          id="seo-meta"
          rows={3}
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
          maxLength={170}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">{meta.length}/170 characters</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="status">Moderation status</Label>
        <select
          id="status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ModerationStatus)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="approved">Approved (visible publicly)</option>
          <option value="pending_review">Pending review</option>
          <option value="draft">Draft</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => update.mutate()} disabled={update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" /> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

// ── Delete confirm dialog ──────────────────────────────────────────────

function DeleteDialog({ niche, onClose }: { niche: NicheRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);

  const del = useMutation({
    mutationFn: async () => {
      if (!niche) return;
      const { error } = await supabase.from('niche_pages').delete().eq('id', niche.id);
      if (error) throw error;
      void logAuditEvent({
        resource_type: 'niche_page',
        resource_id: niche.id,
        resource_slug: niche.slug,
        action: 'deleted',
      });
    },
    onSuccess: () => {
      pushToast('Niche page deleted', 'success');
      qc.invalidateQueries({ queryKey: ['admin', 'niche-pages'] });
      onClose();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Delete failed', 'error'),
  });

  return (
    <Dialog open={!!niche} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete niche page?</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{niche?.niche_name}</strong> and its content.
            Internal links pointing to <code>/best/{niche?.slug}</code> will 404.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
            {del.isPending ? <Loader2 className="animate-spin" /> : 'Delete permanently'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
