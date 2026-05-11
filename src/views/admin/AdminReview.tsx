import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Skeleton } from '@/components/Skeleton';
import { useUIStore } from '@/stores/ui';
import { logAuditEvent } from '@/lib/audit-log';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Tool } from '@/types/tool';

type ReviewItem = Pick<
  Tool,
  | 'id'
  | 'name'
  | 'slug'
  | 'description'
  | 'quality_score'
  | 'moderation_status'
  | 'rejection_reason'
  | 'updated_at'
>;

async function fetchReviewQueue(): Promise<ReviewItem[]> {
  const { data, error } = await supabase
    .from('tools')
    .select('id, name, slug, description, quality_score, moderation_status, rejection_reason, updated_at')
    .or('moderation_status.eq.pending_review,quality_score.lt.75')
    .order('quality_score', { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ReviewItem[];
}

export default function AdminReview() {
  const qc = useQueryClient();
  const pushToast = useUIStore((s) => s.pushToast);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'review-queue'],
    queryFn: fetchReviewQueue,
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tools')
        .update({
          moderation_status: 'approved',
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', id);
      if (error) throw error;
      const slug = data?.find((d) => d.id === id)?.slug;
      void logAuditEvent({
        resource_type: 'tool',
        resource_id: id,
        resource_slug: slug,
        action: 'approved',
      });
    },
    onSuccess: () => {
      pushToast('Approved', 'success');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Failed', 'error'),
  });

  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase
        .from('tools')
        .update({
          moderation_status: 'rejected',
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', id);
      if (error) throw error;
      const slug = data?.find((d) => d.id === id)?.slug;
      void logAuditEvent({
        resource_type: 'tool',
        resource_id: id,
        resource_slug: slug,
        action: 'rejected',
        notes: reason,
      });
    },
    onSuccess: () => {
      pushToast('Rejected', 'success');
      setRejectingId(null);
      setRejectReason('');
      qc.invalidateQueries({ queryKey: ['admin'] });
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : 'Failed', 'error'),
  });

  return (
    <div className="px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pending review or quality score below 75. Approve to publish, reject to send back for
          regeneration.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {data && data.length === 0 && (
        <div className="rounded-2xl border border-green-100 bg-green-50 p-12 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
          <p className="mt-4 text-lg font-bold text-gray-900">All caught up!</p>
          <p className="mt-1 text-sm text-gray-600">
            No items are pending review. Check back after the next content generation run.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {data?.map((item) => {
          const isLow = (item.quality_score ?? 100) < 75;
          const isPending = item.moderation_status === 'pending_review';
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-900 truncate">{item.name}</h3>
                    {isLow && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        <AlertTriangle className="h-3 w-3" />
                        Quality {item.quality_score}/100
                      </span>
                    )}
                    {isPending && (
                      <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Pending Review
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{item.description}</p>
                  <a
                    href={`/tools/${item.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
                  >
                    Preview <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => approve.mutate(item.id)}
                    disabled={approve.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-60"
                  >
                    {approve.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Approve
                  </button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRejectingId(item.id)}
                  >
                    <XCircle />
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Reject confirmation dialog — single instance, driven by rejectingId */}
      <Dialog
        open={!!rejectingId}
        onOpenChange={(open) => {
          if (!open) {
            setRejectingId(null);
            setRejectReason('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this item?</DialogTitle>
            <DialogDescription>
              Provide a reason — it will be saved on the record so the editorial team can
              regenerate or fix the content.
            </DialogDescription>
          </DialogHeader>
          <textarea
            rows={3}
            placeholder="Reason for rejection…"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRejectingId(null);
                setRejectReason('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason || reject.isPending}
              onClick={() => rejectingId && reject.mutate({ id: rejectingId, reason: rejectReason })}
            >
              {reject.isPending ? <Loader2 className="animate-spin" /> : 'Confirm reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
