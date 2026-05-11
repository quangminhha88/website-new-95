import type { VercelRequest, VercelResponse } from '@vercel/node'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  // Health check should probably be GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    // version: process.env.npm_package_version // This might not be available in serverless
  })
}
