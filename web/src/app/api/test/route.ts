/*
 * @Author: shaoliye
 * @Date: 2026-04-24 15:41:31
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 16:34:38
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */

export async function GET() {
  const res = await fetch(`${process.env.NEST_BASE_URL}/test`)
  const data = await res.json()

  return Response.json({
  code: 0,
  data,
  message: 'success'
})
}