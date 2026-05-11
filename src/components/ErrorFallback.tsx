import { useState } from 'react';
import { AlertTriangle, RotateCw, Home, Send, Check } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { reportError } from '@/lib/error-reporter';

interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

/**
 * Pretty error UI. Shown by ErrorBoundary on render errors.
 * Stack trace is dev-only. "Report" sends the error explicitly to logs
 * with a user-flagged context tag (often resolves "missing reproductions").
 */
export default function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const [reported, setReported] = useState(false);
  const isDev = (process.env.NODE_ENV !== "production");

  const handleReport = () => {
    reportError(error, {
      source: 'render',
      context: { user_flagged: true, manual: true },
    });
    setReported(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4 py-12">
      <Card className="max-w-lg w-full">
        <CardContent className="p-8">
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              aria-hidden
            >
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold">Something went wrong</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                We hit an unexpected error. Try refreshing — if it persists, click "Report" so
                our team gets the details.
              </p>

              {isDev && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTitle className="text-xs">Stack trace (dev only)</AlertTitle>
                  <AlertDescription>
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs">
                      {error.message}
                      {'\n\n'}
                      {error.stack}
                    </pre>
                  </AlertDescription>
                </Alert>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={resetError}>
                  <RotateCw />
                  Try again
                </Button>
                <Button asChild variant="outline">
                  <a href="/">
                    <Home />
                    Go home
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleReport}
                  disabled={reported}
                  className="ml-auto"
                >
                  {reported ? (
                    <>
                      <Check />
                      Reported
                    </>
                  ) : (
                    <>
                      <Send />
                      Report
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
