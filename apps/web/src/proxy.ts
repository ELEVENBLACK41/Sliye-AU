/*
 * @Author: shaoliye
 * @Date: 2026-04-23 16:22:59
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 11:35:55
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
//Next中间件（权限/拦截）
// middleware.ts -> proxy.ts
import { NextResponse } from 'next/server'

export default function proxy(request: Request) {
  return NextResponse.next()
}