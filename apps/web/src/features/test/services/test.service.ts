/*
 * @Author: shaoliye
 * @Date: 2026-04-24 16:08:04
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-05-06 00:00:00
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
import { request } from '@/services/request'
import type { ApiResponse, User, TestResponse } from '../types/test.type'

export function getTest() {
  return request<ApiResponse<TestResponse>>('/api/test')
}

export function getUsers() {
  return request<ApiResponse<User[]>>('/api/test/users')
}