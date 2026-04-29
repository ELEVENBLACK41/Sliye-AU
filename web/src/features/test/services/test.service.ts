/*
 * @Author: shaoliye
 * @Date: 2026-04-24 16:08:04
 * @Email: shaoliye@fengmap.com
 * @LastEditTime: 2026-04-24 16:08:12
 * @LastEditors: shaoliye
 * @LastEditorsEmail: shaoliye@fengmap.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
import { request } from '@/services/request'

export function getTest() {
  return request('/api/test')
}