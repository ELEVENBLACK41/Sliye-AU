/*
 * @Author: shaoliye
 * @Date: 2026-05-06 16:52:37
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-06 17:04:37
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
// services/request.ts
export async function request<T = unknown>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

  const res = await fetch(`${baseUrl}${url}`, {
    ...options,
  });

  if (!res.ok) {
    throw new Error(`Request error: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
