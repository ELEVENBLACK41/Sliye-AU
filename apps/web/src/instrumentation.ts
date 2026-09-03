/**
 * 本文件注册 Next.js 服务端进程启动钩子，当前用于启动 AI Runtime 的租约对账。
 */

/** 仅在 Node Runtime 中启动需要常驻进程的后台协调能力。 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') {
    return;
  }

  const { startAiRuntimeMaintenance } = await import('./features/ai/runtime/ai-runtime-maintenance.server.ts');
  startAiRuntimeMaintenance();
}
