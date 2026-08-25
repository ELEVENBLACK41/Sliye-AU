/**
 * 本文件验证 AI 权限策略只为 ACTIVE 用户现取现算授权上下文，
 * 并在用户不存在或状态异常时拒绝，避免账号被禁用后 AI 仍可继续读取业务数据。
 * 不连接真实数据库，Prisma 与授权服务均为内存 mock。
 */

import { UserStatus } from '../../../generated/prisma';
import { BusinessException } from '../../../common/exceptions/business.exception';
import type { AuthorizationService } from '../../auth/services/authorization.service';
import { AiPermissionPolicyService } from './ai-permission-policy';

describe('AiPermissionPolicyService', () => {
  /** 创建只 mock Prisma 用户查询与授权合并逻辑的服务实例。 */
  function createService() {
    const findUnique = jest.fn();
    const prisma = { user: { findUnique } };
    const buildContext = jest.fn();
    const authorizationService = {
      buildContext,
    } as unknown as AuthorizationService;

    return {
      service: new AiPermissionPolicyService(
        prisma as never,
        authorizationService,
      ),
      findUnique,
      buildContext,
    };
  }

  it('为 ACTIVE 用户按登录守卫同款结构组装授权上下文', async () => {
    const { service, findUnique, buildContext } = createService();
    findUnique.mockResolvedValue({
      id: 7,
      deptId: 3,
      status: UserStatus.ACTIVE,
      roles: [
        {
          role: {
            code: 'MEMBER',
            perms: [{ scopeType: 'PROJECT', perm: { code: 'decision:read' } }],
          },
        },
      ],
      permissions: [
        {
          effect: 'ALLOW',
          scopeType: 'OWN',
          expiresAt: null,
          permission: { code: 'decision:read' },
        },
      ],
    });
    const expectedContext = { userId: 7 } as never;
    buildContext.mockReturnValue(expectedContext);

    await expect(service.buildAuthorizationContext(7)).resolves.toBe(
      expectedContext,
    );
    expect(buildContext).toHaveBeenCalledWith({
      id: 7,
      deptId: 3,
      roleCodes: ['MEMBER'],
      roleGrants: [{ code: 'decision:read', scopeType: 'PROJECT' }],
      directGrants: [
        {
          code: 'decision:read',
          effect: 'ALLOW',
          scopeType: 'OWN',
          expiresAt: null,
        },
      ],
    });
  });

  it('用户不存在时拒绝并且不调用授权合并逻辑', async () => {
    const { service, findUnique, buildContext } = createService();
    findUnique.mockResolvedValue(null);

    await expect(service.buildAuthorizationContext(999)).rejects.toThrow(
      BusinessException,
    );
    expect(buildContext).not.toHaveBeenCalled();
  });

  it('用户状态非 ACTIVE 时拒绝，即使账号本身存在', async () => {
    const { service, findUnique, buildContext } = createService();
    findUnique.mockResolvedValue({
      id: 8,
      deptId: null,
      status: UserStatus.DISABLED,
      roles: [],
      permissions: [],
    });

    await expect(service.buildAuthorizationContext(8)).rejects.toThrow(
      BusinessException,
    );
    expect(buildContext).not.toHaveBeenCalled();
  });
});
