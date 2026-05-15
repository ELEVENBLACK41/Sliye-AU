/*
 * @Author: shaoliye
 * @Date: 2026-05-06 16:52:37
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-05-15 15:00:39
 * @LastEditors: shaoliye
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description: 
 * @Copyright: Copyright 1990 - 2026
 */
import React from 'react'
import { getUsers } from '@/features/test'
import type { User } from '@/features/test'
import { Button } from '@nextnest/ui/components/ui/button'

export default async function Dashboard() {
  const res = await getUsers()
  const users: User[] = res.data

  return (
    <div className="p-8 font-sans">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">用户列表（数据库 seed 测试）</h1>
        <Button variant="default" size="sm">
          新增用户
        </Button>
      </div>

      <div className="grid gap-4">
        {users.map((user) => (
          <div
            key={user.id}
            className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-5 bg-white dark:bg-zinc-900 shadow-sm"
          >
            {/* 用户基本信息 */}
            <div className="flex items-center gap-3 mb-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 font-semibold text-sm">
                {(user.name ?? user.email)[0].toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {user.name ?? '—'}
                </p>
                <p className="text-xs text-zinc-500">{user.email}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-zinc-400">ID: {user.id}</span>
                <Button variant="outline" size="sm">编辑</Button>
                <Button variant="destructive" size="sm">删除</Button>
              </div>
            </div>

            {/* 关联文章 */}
            {user.posts.length > 0 ? (
              <ul className="space-y-2 pl-2 border-l-2 border-zinc-100 dark:border-zinc-700">
                {user.posts.map((post) => (
                  <li key={post.id} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-block size-2 rounded-full flex-shrink-0 ${
                        post.published ? 'bg-green-400' : 'bg-zinc-300'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        {post.title}
                      </p>
                      {post.content && (
                        <p className="text-xs text-zinc-500 line-clamp-1">{post.content}</p>
                      )}
                    </div>
                    <span className="ml-auto text-xs text-zinc-400">
                      {post.published ? '已发布' : '草稿'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-zinc-400 pl-2">暂无文章</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
