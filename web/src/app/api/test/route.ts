/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:41:31
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 15:41:44
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */

export async function GET() {
  const res = await fetch('http://localhost:3001/test')
  const data = await res.json()

  return Response.json(data)
}