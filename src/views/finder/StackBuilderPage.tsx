import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Layers, Loader2, Sparkles, AlertCircle, RotateCw } from 'lucide-react';

import SEO from '@/components/SEO';
import Breadcrumbs from '@/components/Breadcrumbs';
import AffiliateCTA from '@/components/AffiliateCTA';
import { combineSchemas, websiteSchema, breadcrumbSchema } from '@/seo/schema';

/**
 * /stack-builder — interactive tool-stack recommender.
 *
 * Flow:
 *   1. user picks role + up to 3 goals
 *   2. POST /api/stack
 *   3. render the 4-6 tool combo the AI returned, each with a one-sentence
 *      "why this tool" rationale and an affiliate CTA
 *
 * State is intentionally local (useState) — no global store needed since
 * the stack only lives for the current session.
 */

const ROLES = [
  'Solo founder',
  'Freelancer',
  'Small team',
  'Agency',
  'Enterprise',
] as const;

const GOALS = [
  'Manage projects',
  'Handle invoicing',
  'CRM / Sales',
  'Marketing & SEO',
  'Team communication',
  'Analytics',
  'Customer support',
] as const;

type Role = (typeof ROLES)[number];
type Goal = (typeof GOALS)[number];

interface StackTool {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  category_name: string | null;
  logo_url: string | null;
  why: string;
}

interface StackResult {
  stack: StackTool[];
}

export default function StackBuilderPage() {
  const [role, setRole] = useState<Role>('Solo founder');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [result, setResult] = useState<StackResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const breadcrumbItems = [
    { label: 'Home', href: '/' },
    { label: 'Stack Builder', href: '/stack-builder', current: true },
  ];

  const schema = combineSchemas(
    websiteSchema(),
    breadcrumbSchema(breadcrumbItems.map((b) => ({ name: b.label, url: b.href }))),
  );

  const toggleGoal = useCallback((goal: Goal) => {
    setGoals((prev) => {
      if (prev.includes(goal)) return prev.filter((g) => g !== goal);
      if (prev.length >= 3) return prev; // cap at 3
      return [...prev, goal];
    });
  }, []);

  const onSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (goals.length === 0) {
        setError('Pick at least one goal first.');
        return;
      }
      setIsLoading(true);
      setError(null);
      setResult(null);
      try {
        const res = await fetch('/api/stack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role, goals }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as StackResult;
        if (!data.stack || data.stack.length === 0) {
          throw new Error('No matching stack returned. Try different goals.');
        }
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setIsLoading(false);
      }
    },
    [role, goals],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <SEO
        title="AI Stack Builder – Find the Perfect Tool Stack for Your Role"
        description="Tell us your role and goals — get a curated SaaS stack picked for you. Free, instant, no signup."
        canonical="/stack-builder"
        schema={schema}
      />

      <main className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 lg:px-8">
        <Breadcrumbs items={breadcrumbItems} className="mb-6" />

        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles size={12} />
            AI-curated
          </div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Stack Builder
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-lg text-gray-600">
            Tell us how you work. We'll assemble a 4-6 tool stack from our directory that
            actually fits — not just whatever ranks highest.
          </p>
        </header>

        {!result && (
          <form onSubmit={onSubmit} className="mt-10 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            {/* Role dropdown */}
            <div className="mb-6">
              <label htmlFor="role" className="block text-sm font-semibold text-gray-900">
                I am a…
              </label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Goals */}
            <fieldset>
              <legend className="block text-sm font-semibold text-gray-900">
                What do you need to do? <span className="text-gray-500 font-normal">(pick up to 3)</span>
              </legend>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {GOALS.map((goal) => {
                  const checked = goals.includes(goal);
                  const disabled = !checked && goals.length >= 3;
                  return (
                    <label
                      key={goal}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                        checked
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                          : disabled
                            ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleGoal(goal)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span>{goal}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {error && (
              <div className="mt-5 flex items-start gap-2 text-sm text-red-600">
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || goals.length === 0}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Building your stack…
                </>
              ) : (
                <>
                  <Layers size={18} />
                  Build my stack
                </>
              )}
            </button>
          </form>
        )}

        {/* Result */}
        {result && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Your recommended stack</h2>
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                <RotateCw size={14} />
                Start over
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {result.stack.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>

            <p className="mt-8 text-sm text-gray-500 text-center">
              Affiliate links — we may earn when you buy. Recommendations are model-assisted
              and matched against our directory.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Tool card ────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: StackTool }) {
  const initial = (tool.name[0] ?? 'S').toUpperCase();
  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        {tool.logo_url ? (
          <img
            src={tool.logo_url}
            alt=""
            className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-lg font-bold text-white">
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <Link
            href={`/tools/${tool.slug}`}
            className="block font-bold text-gray-900 hover:text-indigo-600"
          >
            {tool.name}
          </Link>
          {tool.tagline && (
            <p className="text-sm text-gray-500 line-clamp-1">{tool.tagline}</p>
          )}
          {tool.category_name && (
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
              {tool.category_name}
            </span>
          )}
        </div>
      </div>

      <p className="mt-4 flex-1 text-sm text-gray-700 leading-relaxed">
        <span className="font-semibold text-gray-900">Why this tool: </span>
        {tool.why}
      </p>

      <div className="mt-4">
        <AffiliateCTA slug={tool.slug} name={tool.name} variant="primary" source="stack-builder" />
      </div>
    </article>
  );
}

// FIXED: New StackBuilderPage at /stack-builder
