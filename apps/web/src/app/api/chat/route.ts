/*
 * @Author: shaoliye elevenblack41@gmail.com
 * @Date: 2026-07-09 14:57:15
 * @LastEditors: shaoliye elevenblack41@gmail.com
 * @LastEditTime: 2026-07-09 16:39:11
 * @FilePath: \NextNest\apps\web\src\app\api\chat\route.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
/**
 * AI 对话测试接口。
 *
 * 用于验证 Vercel AI SDK 的流式对话能力，后续接入 RAG 时再把检索、权限和会话持久化下沉到业务服务中。
 */
import {
  streamText,
  UIMessage,
  convertToModelMessages,
  tool,
  isStepCount,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';
import { z } from 'zod';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: 'openai/gpt-4.1',
    messages: await convertToModelMessages(messages),
    stopWhen: isStepCount(5),
    tools: {
      weather: tool({
        description: 'Get the weather in a location (fahrenheit)',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => {
          const temperature = Math.round(Math.random() * (90 - 32) + 32);
          return {
            location,
            temperature,
          };
        },
      }),
      convertFahrenheitToCelsius: tool({
        description: 'Convert a temperature in fahrenheit to celsius',
        inputSchema: z.object({
          temperature: z.number().describe('The temperature in fahrenheit to convert'),
        }),
        execute: async ({ temperature }) => {
          const celsius = Math.round((temperature - 32) * (5 / 9));
          return {
            celsius,
          };
        },
      }),
    },
    onStepEnd: ({ toolResults }) => {
      console.log('记录使用工具的步骤----------------------', toolResults);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
