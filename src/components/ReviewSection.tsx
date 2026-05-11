import { useMemo, useState, type FormEvent } from 'react';
import { Star, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToolReviews, type ToolReview } from '@/hooks/useReviews';

interface Props {
  toolId: string;
  toolName: string;
}

/**
 * User-facing review block: aggregate rating overview, individual reviews,
 * and a submission form. The form posts to /api/reviews and shows a
 * pending-moderation acknowledgement on success.
 */
export default function ReviewSection({ toolId, toolName }: Props) {
  const { data: reviews, isLoading, error, refetch } = useToolReviews(toolId);

  return (
    <section className="mt-12 border-t border-border pt-10">
      <h2 className="text-2xl font-bold mb-6">Reviews of {toolName}</h2>

      {isLoading && <ReviewSkeleton />}
      {error && (
        <div className="rounded-lg bg-destructive/10 text-destructive p-4 text-sm">
          Couldn't load reviews. Try refreshing.
        </div>
      )}
      {!isLoading && !error && (
        <>
          <RatingOverview reviews={reviews ?? []} />
          <ReviewList reviews={reviews ?? []} />
        </>
      )}

      <ReviewForm toolId={toolId} onSubmitted={refetch} />
    </section>
  );
}

// ── Overview: avg + 5-row distribution bars ──────────────────────────

function RatingOverview({ reviews }: { reviews: ToolReview[] }) {
  const stats = useMemo(() => {
    if (reviews.length === 0) return null;
    const counts = [0, 0, 0, 0, 0]; // index 0 = 1-star, ..., 4 = 5-star
    let sum = 0;
    for (const r of reviews) {
      counts[Math.max(1, Math.min(5, r.rating)) - 1]++;
      sum += r.rating;
    }
    return {
      avg: sum / reviews.length,
      total: reviews.length,
      counts,
    };
  }, [reviews]);

  if (!stats) {
    return (
      <p className="text-sm text-muted-foreground mb-8">
        No reviews yet — be the first to share your experience below.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-6 mb-8 p-5 rounded-xl border border-border bg-muted/30">
      <div className="text-center">
        <p className="text-4xl font-bold">{stats.avg.toFixed(1)}</p>
        <StarRow value={stats.avg} size={18} />
        <p className="text-xs text-muted-foreground mt-1">{stats.total} reviews</p>
      </div>
      <div className="flex flex-col gap-1.5 justify-center">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = stats.counts[star - 1];
          const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
          return (
            <div key={star} className="flex items-center gap-2 text-xs">
              <span className="w-4 text-right tabular-nums">{star}</span>
              <Star size={12} className="fill-yellow-500 text-yellow-500" aria-hidden />
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-yellow-500" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-8 text-right tabular-nums text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────

function ReviewList({ reviews }: { reviews: ToolReview[] }) {
  if (reviews.length === 0) return null;
  return (
    <ul className="space-y-6 mb-10">
      {reviews.map((r) => (
        <li key={r.id} className="border-b border-border pb-5 last:border-0">
          <div className="flex items-start justify-between gap-3 mb-1.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <StarRow value={r.rating} size={14} />
                {r.verified && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600"
                    title="Email-verified review"
                  >
                    <CheckCircle2 size={12} />
                    Verified
                  </span>
                )}
              </div>
              {r.title && <h3 className="font-semibold mt-1">{r.title}</h3>}
            </div>
            <time className="text-xs text-muted-foreground flex-shrink-0">
              {new Date(r.created_at).toLocaleDateString()}
            </time>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">{r.body}</p>
          <p className="text-xs text-muted-foreground mt-2">— {r.author_name}</p>
        </li>
      ))}
    </ul>
  );
}

// ── Submission form ──────────────────────────────────────────────────

interface FormState {
  author_name: string;
  author_email: string;
  rating: number;
  title: string;
  body: string;
}

function ReviewForm({
  toolId,
  onSubmitted,
}: {
  toolId: string;
  onSubmitted: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    author_name: '',
    author_email: '',
    rating: 0,
    title: '',
    body: '',
  });
  const [hover, setHover] = useState(0);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((s) => ({ ...s, [key]: value }));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'submitting') return;
    if (form.rating < 1) {
      setErrorMsg('Pick a star rating first.');
      setStatus('error');
      return;
    }
    if (form.body.trim().length < 30) {
      setErrorMsg('Review body must be at least 30 characters.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool_id: toolId,
          author_name: form.author_name.trim(),
          author_email: form.author_email.trim(),
          rating: form.rating,
          title: form.title.trim() || undefined,
          body: form.body.trim(),
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      setStatus('success');
      setForm({ author_name: '', author_email: '', rating: 0, title: '', body: '' });
      onSubmitted();
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  if (status === 'success') {
    return (
      <div className="mt-2 p-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-sm">
        <p className="font-medium text-emerald-700 dark:text-emerald-400">
          Thanks — your review was submitted.
        </p>
        <p className="text-muted-foreground mt-1">
          It'll appear here once a moderator approves it (usually within 24 hours).
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 p-5 rounded-xl border border-border bg-card">
      <h3 className="text-lg font-bold mb-4">Write a review</h3>

      {/* Star picker */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1.5">Rating</label>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (hover || form.rating) >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={form.rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                onClick={() => update('rating', n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <Star
                  size={28}
                  className={
                    filled
                      ? 'fill-yellow-500 text-yellow-500'
                      : 'text-muted-foreground/40'
                  }
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <Field label="Your name">
          <input
            type="text"
            required
            minLength={2}
            maxLength={80}
            value={form.author_name}
            onChange={(e) => update('author_name', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Email (not displayed)">
          <input
            type="email"
            required
            value={form.author_email}
            onChange={(e) => update('author_email', e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
      </div>

      <Field label="Title (optional)">
        <input
          type="text"
          maxLength={120}
          value={form.title}
          onChange={(e) => update('title', e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm mb-3"
        />
      </Field>

      <Field label="Review">
        <textarea
          required
          minLength={30}
          maxLength={5000}
          rows={5}
          value={form.body}
          onChange={(e) => update('body', e.target.value)}
          placeholder="What did you like or dislike? Who is this tool ideal for?"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
        />
        <p className="text-xs text-muted-foreground mt-1">
          {form.body.trim().length}/30 minimum characters
        </p>
      </Field>

      {status === 'error' && errorMsg && (
        <div className="mt-3 flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting'}
        className="mt-4 inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {status === 'submitting' ? 'Submitting...' : 'Submit review'}
      </button>
    </form>
  );
}

// ── Tiny helpers ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function StarRow({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <div className="inline-flex items-center" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          className={
            n <= Math.round(value)
              ? 'fill-yellow-500 text-yellow-500'
              : 'text-muted-foreground/30'
          }
          aria-hidden
        />
      ))}
    </div>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="animate-pulse h-24 rounded-lg bg-muted/50" />
      ))}
    </div>
  );
}
