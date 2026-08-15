/**
 * 本文件统一配置 Socket.IO 的 Web Origin 白名单和 websocket 单传输模式。
 */
import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

/** 让全部 Socket.IO Gateway 复用服务启动时已经校验过的跨域规则。 */
export class ConfiguredSocketIoAdapter extends IoAdapter {
  /** 保存浏览器允许直连的 Origin 白名单。 */
  constructor(
    app: INestApplicationContext,
    private readonly webOrigins: readonly string[],
  ) {
    super(app);
  }

  /** 创建仅使用 WebSocket 传输且限制跨域来源的 Socket.IO 服务。 */
  override createIOServer(
    port: number,
    options?: Record<string, unknown>,
  ): unknown {
    return super.createIOServer(port, {
      ...options,
      transports: ['websocket'],
      cors: {
        origin: [...this.webOrigins],
        credentials: true,
      },
    }) as unknown;
  }
}
