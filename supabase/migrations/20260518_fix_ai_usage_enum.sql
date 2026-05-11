-- Widen ai_usage_logs.provider CHECK to include all real providers and the
-- in-code sentinels (cache, fallback). Idempotent.
begin;

alter table ai_usage_logs drop constraint if exists ai_usage_logs_provider_check;
alter table ai_usage_logs add constraint ai_usage_logs_provider_check
  check (provider in ('gemini', 'anthropic', 'groq', 'openai', 'cache', 'fallback'));

commit;
