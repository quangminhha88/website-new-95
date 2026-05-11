/**
 * Admin action audit log.
 *
 * Writes to `content_audit_logs` (Phase 1 schema) so every admin mutation
 * has an actor, timestamp, and changeset. Use the helpers below from any
 * mutation handler in /admin pages.
 *
 * Failures are logged-and-swallowed: an audit-log write should NEVER block
 * the underlying mutation from succeeding.
 */
import { supabase } from './supabase';
import { createLogger } from './logger';

const log = createLogger('audit');

export type AuditResource = 'tool' | 'niche_page' | 'comparison' | 'category';
export type AuditAction =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'submitted_for_review'
  | 'approved'
  | 'rejected'
  | 'regenerated'
  | 'published'
  | 'unpublished';

export interface AuditEntry {
  resource_type: AuditResource;
  resource_id: string;
  resource_slug?: string;
  action: AuditAction;
  /** Field-level diff: { field: [old, new] } */
  changes?: Record<string, [unknown, unknown]>;
  quality_score?: number;
  notes?: string;
}

/**
 * Record an admin action. Fire-and-forget — never throws.
 */
export async function logAuditEvent(entry: AuditEntry): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const { error } = await supabase.from('content_audit_logs').insert({
      resource_type: entry.resource_type,
      resource_id: entry.resource_id,
      resource_slug: entry.resource_slug ?? null,
      action: entry.action,
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      changes: entry.changes ?? null,
      quality_score: entry.quality_score ?? null,
      notes: entry.notes ?? null,
    });
    if (error) log.warn('audit-log write failed', error.message);
  } catch (err) {
    log.warn('audit-log threw', err instanceof Error ? err.message : err);
  }
}

/**
 * Bulk variant — logs N actions of the same type in one round trip.
 * Use for bulk-approve / bulk-reject so the audit table doesn't get a
 * separate insert per item.
 */
export async function logAuditBulk(
  entries: AuditEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    const rows = entries.map((e) => ({
      resource_type: e.resource_type,
      resource_id: e.resource_id,
      resource_slug: e.resource_slug ?? null,
      action: e.action,
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      changes: e.changes ?? null,
      quality_score: e.quality_score ?? null,
      notes: e.notes ?? null,
    }));

    const { error } = await supabase.from('content_audit_logs').insert(rows);
    if (error) log.warn('audit-log bulk write failed', error.message);
  } catch (err) {
    log.warn('audit-log bulk threw', err instanceof Error ? err.message : err);
  }
}
