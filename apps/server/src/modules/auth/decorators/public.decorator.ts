/*
 * @Description: 公开接口装饰器，用于显式跳过全局认证与权限守卫。
 */
import { SetMetadata } from '@nestjs/common';

/** 标识当前控制器或接口无需登录即可访问的元数据键。 */
export const IS_PUBLIC_ROUTE_METADATA_KEY = 'is_public_route';

/**
 * 声明当前控制器或接口为公开接口。
 *
 * 全局认证守卫默认保护全部接口，只有登录、注册、刷新令牌和健康检查等
 * 明确标记过的入口才会绕过认证，从而避免新增 Controller 时遗漏守卫。
 */
export function Public() {
  return SetMetadata(IS_PUBLIC_ROUTE_METADATA_KEY, true);
}
