/*
 * @Author: shaoliye
 * @Date: 2026-05-22 16:21:42
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-22 16:25:04
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: 此文件为封装 BFF 自己这一层出错时的兜底返回
 * @Copyright: Copyright 1990 - 2026
 */
import { NextResponse } from "next/server"

type ApiErrorOptions = {
  status?: number
  message: string
}

export function apiError({ message, status = 500 }: ApiErrorOptions) {
  return NextResponse.json(
    {
      code: status,
      message,
      data: null,
      timestamp: Date.now(),
    },
    { status },
  )
}

export function apiErrorFromUnknown(
  error: unknown,
  fallbackMessage: string,
  status = 500,
) {
  return apiError({
    status,
    message: error instanceof Error ? error.message : fallbackMessage,
  })
}

export function upstreamError(status: number, message = "Upstream error") {
  return apiError({
    status,
    message,
  })
}
