/*
 * @Author: shaoliye
 * @Date: 2026-04-23 16:22:59
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-23 16:26:54
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
//Next中间件（权限/拦截）
// middleware.ts -> proxy.ts
import { NextRequest, NextResponse } from 'next/server';

//Next 中间件（权限/拦截）
// middleware.ts -> proxy.ts
export function middleware(request: NextRequest) {
	// 占位实现：允许请求继续。根据需要在此添加拦截/鉴权逻辑
	return NextResponse.next();
}