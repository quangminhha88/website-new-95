/**
 * Universal logger — works in browser and serverless.
 * Replaces logger.ts, logger.client.ts, logger.server.ts.
 *
 * In production, logs are silenced except `warn` and `error`.
 * In tests, all logs are silenced unless DEBUG=1.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isProduction =
  (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') ||
  (process.env.NODE_ENV === "production");

const isTest =
  typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

const debugEnabled =
  typeof process !== 'undefined' && process.env?.DEBUG === '1';

function shouldLog(level: LogLevel): boolean {
  if (isTest && !debugEnabled) return false;
  if (isProduction) return level === 'warn' || level === 'error';
  return true;
}

function format(level: LogLevel, scope: string, msg: string): string {
  return `[${level.toUpperCase()}] [${scope}] ${msg}`;
}

export interface Logger {
  debug: (msg: string, meta?: unknown) => void;
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (msg, meta) => {
      if (!shouldLog('debug')) return;
      meta !== undefined ? console.log(format('debug', scope, msg), meta) : console.log(format('debug', scope, msg));
    },
    info: (msg, meta) => {
      if (!shouldLog('info')) return;
      meta !== undefined ? console.info(format('info', scope, msg), meta) : console.info(format('info', scope, msg));
    },
    warn: (msg, meta) => {
      if (!shouldLog('warn')) return;
      meta !== undefined ? console.warn(format('warn', scope, msg), meta) : console.warn(format('warn', scope, msg));
    },
    error: (msg, meta) => {
      if (!shouldLog('error')) return;
      meta !== undefined ? console.error(format('error', scope, msg), meta) : console.error(format('error', scope, msg));
    },
  };
}

export const logger = createLogger('app');
