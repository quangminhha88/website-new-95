import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Bookmark, Search, History, LogOut, Loader2, Mail } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth';
import { useSavedTools, useSearchHistory, useToggleSavedTool } from '@/hooks/useUserFeatures';
import { Skeleton, SkeletonCard } from '@/components/Skeleton';
import OptimizedImage from '@/components/OptimizedImage';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Tab = 'saved' | 'history' | 'collections';

export default function AccountPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-gray-50">
      <SEO title="Your Account" description="Saved tools and history" canonical="/account" />
      <div className="mx-auto max-w-4xl px-4 py-12">
        {!user ? <SignInForm /> : <AccountDashboard />}
      </div>
    </div>
  );
}

function AccountDashboard() {
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [tab, setTab] = useState<Tab>('saved');

  const tabs: { id: Tab; label: string; icon: typeof Bookmark }[] = [
    { id: 'saved', label: 'Saved Tools', icon: Bookmark },
    { id: 'history', label: 'Search History', icon: History },
  ];

  return (
    <>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Account</h1>
          <p className="mt-1 text-sm text-gray-500">{user?.email}</p>
        </div>
        <button
          type="button"
          onClick={signOut}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 border-b-2 py-3 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'saved' && <SavedToolsTab />}
      {tab === 'history' && <SearchHistoryTab />}
    </>
  );
}

function SavedToolsTab() {
  const { data, isLoading } = useSavedTools();
  const toggle = useToggleSavedTool();

  if (isLoading) return <SkeletonCard count={4} />;

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
        <Bookmark className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          You haven't saved any tools yet. Browse the directory and click the bookmark icon
          to save a tool here.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Browse Tools
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((s) => (
        <div
          key={s.id}
          className="flex items-start gap-4 rounded-2xl border border-gray-100 bg-white p-4 hover:shadow-sm transition-shadow"
        >
          <Link href={`/tools/${s.tool.slug}`} className="flex-1 flex items-start gap-4 min-w-0">
            <OptimizedImage
              src={s.tool.logo_url}
              alt={s.tool.name}
              fallbackText={s.tool.name}
              className="h-12 w-12 flex-shrink-0 rounded-lg"
            />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{s.tool.name}</p>
              <p className="text-xs text-gray-500 line-clamp-2">{s.tool.tagline}</p>
            </div>
          </Link>
          <button
            type="button"
            onClick={() => toggle.mutate({ toolId: s.tool_id, save: false })}
            aria-label="Remove"
            className="text-xs text-gray-400 hover:text-red-600"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

function SearchHistoryTab() {
  const { data, isLoading } = useSearchHistory(20);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-12 text-center">
        <Search className="mx-auto h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">No search history yet.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white">
      {data.map((h) => (
        <li key={h.id} className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Search className="h-4 w-4 flex-shrink-0 text-gray-400" />
            <Link
              href={`/finder?q=${encodeURIComponent(h.query)}`}
              className="text-sm text-gray-900 hover:text-indigo-600 truncate"
            >
              {h.query}
            </Link>
          </div>
          <span className="text-xs text-gray-500">
            {new Date(h.searched_at).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SignInForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const action = mode === 'signin' ? 'signInWithPassword' : 'signUp';
      const { data, error: err } = await supabase.auth[action]({ email, password });
      if (err) throw err;
      if (mode === 'signup' && !data.session) {
        setInfo('Check your email for a confirmation link.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </CardTitle>
              <CardDescription>
                {mode === 'signin'
                  ? 'Save tools, get personalized recommendations.'
                  : 'Free forever. No card required.'}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive"
              >
                {error}
              </div>
            )}
            {info && (
              <div
                role="status"
                className="rounded-md bg-success/10 border border-success/20 p-3 text-sm text-success-foreground"
              >
                {info}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : mode === 'signin' ? (
                'Sign in'
              ) : (
                'Create account'
              )}
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 font-semibold"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError(null);
                setInfo(null);
              }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </Button>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
