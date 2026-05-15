/*
 * @Author: shaoliye
 * @Date: 2026-04-24 16:08:25
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-05-06 00:00:00
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */

/** 统一后端响应体格式 */
export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  timestamp: number
}

export interface TestResponse {
  msg: string
}

export interface Post {
  id: number
  title: string
  content: string | null
  published: boolean | null
}

export interface User {
  id: number
  email: string
  name: string | null
  posts: Post[]
}