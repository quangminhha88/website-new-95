import React from 'react';
import { ImageResponse } from '@vercel/og';

/**
 * GET /api/og/tool?slug=<slug>
 *
 * Edge-runtime dynamic OG image (1200×630). Hand-rolls a fetch against
 * the Supabase REST API — the supabase-js client pulls in Node-only
 * code paths and won't run on the edge runtime.
 *
 * Falls back to a generic brand card when the tool can't be resolved
 * (deleted slug, network blip, missing env). Always returns 200 with a
 * valid PNG so social crawlers don't show a broken image.
 */
export const config = { runtime: 'edge' };

const WIDTH = 1200;
const HEIGHT = 630;
const BRAND = '#4f46e5';
const APP_URL = process.env.APP_URL ?? 'https://saas-excellence-hub.vercel.app';

interface ToolRow {
  name: string;
  tagline: string | null;
  avg_rating: number | null;
  review_count: number | null;
  pricing_model: string | null;
  logo_url: string | null;
}

const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max - 1).trim() + '…' : s;

async function fetchTool(slug: string): Promise<ToolRow | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/tools?slug=eq.${encodeURIComponent(slug)}` +
        `&select=name,tagline,avg_rating,review_count,pricing_model,logo_url&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as ToolRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export default async function handler(req: Request) {
  const slug = new URL(req.url).searchParams.get('slug') ?? '';
  const tool = slug ? await fetchTool(slug) : null;

  const initial = (tool?.name ?? 'S')[0].toUpperCase();

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          borderBottom: `4px solid ${BRAND}`,
          padding: '70px',
          fontFamily: '"Inter", system-ui, sans-serif',
        }}
      >
        {/* Top row: logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {tool?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tool.logo_url}
              width={80}
              height={80}
              style={{ borderRadius: '16px', objectFit: 'cover' }}
              alt=""
            />
          ) : (
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '16px',
                backgroundColor: BRAND,
                color: '#ffffff',
                fontSize: 44,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {initial}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 48, fontWeight: 800, color: '#111827', lineHeight: 1.1 }}>
              {tool ? truncate(tool.name, 40) : 'SaaS Excellence Hub'}
            </span>
            {tool?.tagline && (
              <span style={{ fontSize: 24, color: '#6b7280', marginTop: 8 }}>
                {truncate(tool.tagline, 80)}
              </span>
            )}
          </div>
        </div>

        {/* Middle: rating + pricing pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginTop: 'auto',
            marginBottom: 16,
          }}
        >
          {tool?.avg_rating != null && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: 28,
                color: '#111827',
                fontWeight: 600,
              }}
            >
              <span style={{ color: '#f59e0b', marginRight: 8 }}>★</span>
              {tool.avg_rating}
              {tool.review_count ? (
                <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8 }}>
                  ({tool.review_count} reviews)
                </span>
              ) : null}
            </div>
          )}
          {tool?.pricing_model && (
            <div
              style={{
                display: 'flex',
                padding: '8px 18px',
                borderRadius: '9999px',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                fontSize: 22,
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {tool.pricing_model}
            </div>
          )}
        </div>

        {/* Bottom-right: site name */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <span style={{ fontSize: 22, color: '#9ca3af', fontWeight: 600 }}>
            {APP_URL.replace(/^https?:\/\//, '')}
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
      },
    },
  );
}
