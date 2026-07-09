/*
 * @Author: shaoliye
 * @Date: 2026-07-06 15:33:12
 * @Email: elevenblack41@gmail.com
 * @LastEditTime: 2026-07-09 16:31:58
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditorsEmail: elevenblack41@gmail.com
 * @Description:
 * @Copyright: Copyright 1990 - 2026
 */
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  //vercek 的 AI SDK 提供的 useChat hook，封装了与后端 API 的交互逻辑，messages,当前聊天消息（一个包含id、role和parts属性的对象数组）,sendMessage- 向聊天 API 发送消息的函数。
  const { messages, sendMessage } = useChat();
  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map((message) => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={`${message.id}-${i}`}>{part.text}</div>;
              case 'tool-weather':
              case 'tool-convertFahrenheitToCelsius':
                return <pre key={`${message.id}-${i}`}>{JSON.stringify(part, null, 2)}</pre>;
            }
          })}
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          className="fixed dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={(e) => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}
