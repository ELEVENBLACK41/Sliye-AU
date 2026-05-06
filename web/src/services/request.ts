// services/request.ts
export async function request<T = unknown>(url: string, options?: RequestInit): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL

  const res = await fetch(`${baseUrl}${url}`, {
    ...options
  })

  if (!res.ok) {
    throw new Error(`Request error: ${res.status}`)
  }

  return res.json() as Promise<T>
}