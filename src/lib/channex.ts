// BaW OS — Channex Channel Manager API client

const CHANNEX_BASE = process.env.CHANNEX_API_URL
const CHANNEX_KEY = process.env.CHANNEX_API_KEY

async function channexFetch<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${CHANNEX_BASE}${path}`, {
    ...options,
    headers: {
      'user-api-key': CHANNEX_KEY!,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`Channex ${path}: ${res.status}`)
  return res.json()
}

export { channexFetch }
