import React from 'react'
import { getUsers } from '@/features/test'
import type { User } from '@/features/test'

export default async function Dashboard() {
  const res = await getUsers()
  const users: User[] = res.data

  return (
    <div className="p-8 font-sans">
      <h1 className="text-2xl font-bold mb-6">用户列表（数据库 seed 测试）</h1>

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
              <span className="ml-auto text-xs text-zinc-400">ID: {user.id}</span>
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
