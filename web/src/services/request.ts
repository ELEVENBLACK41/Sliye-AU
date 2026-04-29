// services/request.ts
export async function request(url: string, options?: RequestInit) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  const res = await fetch(`${baseUrl}${url}`, {
    ...options
  })

  if (!res.ok) {
    throw new Error(`Request error: ${res.status}`)
  }

  return res.json()
}