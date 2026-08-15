/**
 * @file 权限目录同步与漂移检查脚本。
 * @description 将共享契约中的系统权限、系统角色及默认授权幂等同步到数据库；
 *              传入 --check 时只读取数据库并报告漂移，不会执行任何写操作。
 */
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import {
  SYSTEM_PERMISSION_DEFINITIONS,
  SYSTEM_ROLE_DEFINITIONS,
  type AccessDataScope,
  type GrantableDataScope,
  type SystemRoleCode,
} from '@workspace/contracts/access';

import {
  DataScope,
  PermissionKind,
  Prisma,
  PrismaClient,
  UserStatus,
} from '../src/generated/prisma';

/** 脚本支持的运行模式。 */
type AccessControlSyncMode = 'sync' | 'check';

/** 系统角色同步后得到的数据库角色主键映射。 */
type SystemRoleIdMap = ReadonlyMap<SystemRoleCode, number>;

/** 权限目录漂移检查结果。 */
type AccessControlDriftReport = {
  /** 检查过程中发现的所有漂移说明。 */
  issues: string[];
};

/** 系统角色定义中的单条默认授权。 */
type SystemRoleGrantDefinition = {
  /** 系统权限码。 */
  code: string;
  /** 授权数据范围。 */
  scopeType: GrantableDataScope;
};

/** 旧版角色代码或名称到 V2 系统角色的兼容映射。 */
const LEGACY_ROLE_ALIASES: Partial<Record<SystemRoleCode, readonly string[]>> =
  {
    DEPARTMENT_MANAGER: ['MANAGER'],
  };

/** V2 上线前使用过、需要保留但不再作为系统权限维护的宽泛权限码前缀。 */
const LEGACY_PERMISSION_PREFIXES = ['access-management:'] as const;

/**
 * 读取并校验脚本运行模式。
 *
 * @returns 未传参数时返回 sync，传入 --check 时返回 check。
 */
function resolveMode(): AccessControlSyncMode {
  const argumentsSet = new Set(process.argv.slice(2));
  const supportedArguments = new Set(['--sync', '--check']);
  const unknownArguments = [...argumentsSet].filter(
    (argument) => !supportedArguments.has(argument),
  );

  if (unknownArguments.length > 0) {
    throw new Error(`不支持的参数：${unknownArguments.join('、')}`);
  }

  if (argumentsSet.has('--sync') && argumentsSet.has('--check')) {
    throw new Error('不能同时使用 --sync 和 --check。');
  }

  return argumentsSet.has('--check') ? 'check' : 'sync';
}

/**
 * 创建供脚本使用的 Prisma 客户端。
 *
 * @returns 已配置 PostgreSQL driver adapter 的 Prisma 客户端。
 */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env['DATABASE_URL']?.trim();

  if (!connectionString) {
    throw new Error('缺少 DATABASE_URL，无法连接数据库。');
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

/**
 * 将共享契约中的字符串数据范围转换为 Prisma 枚举。
 *
 * @param scopeType 共享契约定义的数据范围。
 * @returns 可直接写入数据库的数据范围枚举。
 */
function toPrismaDataScope(scopeType: AccessDataScope): DataScope {
  const value = DataScope[scopeType as keyof typeof DataScope];

  if (!value) {
    throw new Error(`系统角色目录包含未知数据范围：${scopeType}`);
  }

  return value;
}

/**
 * 生成角色授权的稳定比较键。
 *
 * @param permissionCode 权限码。
 * @param scopeType 数据范围。
 * @returns 用于比较数据库授权与代码目录授权的唯一键。
 */
function createGrantKey(
  permissionCode: string,
  scopeType: AccessDataScope | DataScope,
): string {
  return `${permissionCode}\u0000${scopeType}`;
}

/**
 * 判断权限码是否属于 V2 上线前的遗留权限。
 *
 * @param permissionCode 待检查的权限码。
 * @returns 点号权限码或旧版宽泛权限码返回 true。
 */
function isLegacyPermissionCode(permissionCode: string): boolean {
  return (
    permissionCode.includes('.') ||
    LEGACY_PERMISSION_PREFIXES.some((prefix) =>
      permissionCode.startsWith(prefix),
    )
  );
}

/**
 * 获取去重后的旧角色兼容别名。
 *
 * @returns 可直接用于 Prisma 字符串筛选的旧角色代码数组。
 */
function getLegacyRoleAliases(): string[] {
  return [
    ...new Set(
      Object.values(LEGACY_ROLE_ALIASES).flatMap((aliases) => aliases ?? []),
    ),
  ];
}

/**
 * 校验共享契约中的权限与角色目录是否能安全同步。
 *
 * @throws 当权限码重复、角色代码重复、角色引用未知权限或范围越界时抛出错误。
 */
function validateCatalogDefinitions(): void {
  const permissionCodes = new Set<string>();

  for (const permission of SYSTEM_PERMISSION_DEFINITIONS) {
    if (permissionCodes.has(permission.code)) {
      throw new Error(`系统权限目录存在重复权限码：${permission.code}`);
    }

    permissionCodes.add(permission.code);
  }

  const roleCodes = new Set<SystemRoleCode>();

  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    if (roleCodes.has(role.code)) {
      throw new Error(`系统角色目录存在重复角色代码：${role.code}`);
    }

    roleCodes.add(role.code);

    const roleGrantKeys = new Set<string>();
    const grants = role.permissions as readonly SystemRoleGrantDefinition[];

    for (const grant of grants) {
      const permission = SYSTEM_PERMISSION_DEFINITIONS.find(
        (item) => item.code === grant.code,
      );

      if (!permission) {
        throw new Error(`系统角色 ${role.code} 引用了未知权限：${grant.code}`);
      }

      if (
        !(permission.allowedScopes as readonly AccessDataScope[]).includes(
          grant.scopeType,
        )
      ) {
        throw new Error(
          `系统角色 ${role.code} 的权限 ${grant.code} 使用了不允许的数据范围 ${grant.scopeType}`,
        );
      }

      const grantKey = createGrantKey(grant.code, grant.scopeType);

      if (roleGrantKeys.has(grantKey)) {
        throw new Error(
          `系统角色 ${role.code} 存在重复授权：${grant.code}/${grant.scopeType}`,
        );
      }

      roleGrantKeys.add(grantKey);
    }
  }

  const requiredRoleCodes: readonly SystemRoleCode[] = [
    'SUPER_ADMIN',
    'ADMIN',
    'DEPARTMENT_MANAGER',
    'MEMBER',
  ];
  const missingRoleCodes = requiredRoleCodes.filter(
    (roleCode) => !roleCodes.has(roleCode),
  );

  if (missingRoleCodes.length > 0) {
    throw new Error(`系统角色目录缺少必需角色：${missingRoleCodes.join('、')}`);
  }
}

/**
 * 同步系统权限定义，并将已识别的旧权限标记为 LEGACY。
 *
 * @param transaction 当前数据库事务。
 */
async function syncSystemPermissions(
  transaction: Prisma.TransactionClient,
): Promise<void> {
  const systemPermissionCodes = SYSTEM_PERMISSION_DEFINITIONS.map(
    (permission) => permission.code,
  );

  for (const permission of SYSTEM_PERMISSION_DEFINITIONS) {
    await transaction.permission.upsert({
      where: { code: permission.code },
      create: {
        code: permission.code,
        name: permission.name,
        module: permission.module,
        action: permission.action,
        desc: permission.description,
        kind: PermissionKind.SYSTEM,
      },
      update: {
        name: permission.name,
        module: permission.module,
        action: permission.action,
        desc: permission.description,
        kind: PermissionKind.SYSTEM,
      },
    });
  }

  const nonSystemPermissions = await transaction.permission.findMany({
    where: { code: { notIn: systemPermissionCodes } },
    select: { id: true, code: true, kind: true },
  });
  const legacyPermissionIds = nonSystemPermissions
    .filter(
      (permission) =>
        permission.kind === PermissionKind.SYSTEM ||
        isLegacyPermissionCode(permission.code),
    )
    .map((permission) => permission.id);

  if (legacyPermissionIds.length > 0) {
    await transaction.permission.updateMany({
      where: { id: { in: legacyPermissionIds } },
      data: { kind: PermissionKind.LEGACY },
    });
  }
}

/**
 * 将旧角色的用户关系合并到目标系统角色，然后删除旧角色。
 *
 * @param transaction 当前数据库事务。
 * @param sourceRoleId 旧角色主键。
 * @param targetRoleId 目标系统角色主键。
 */
async function mergeLegacyRole(
  transaction: Prisma.TransactionClient,
  sourceRoleId: number,
  targetRoleId: number,
): Promise<void> {
  const sourceAssignments = await transaction.userRole.findMany({
    where: { roleId: sourceRoleId },
    select: { userId: true, assignedAt: true },
  });

  if (sourceAssignments.length > 0) {
    await transaction.userRole.createMany({
      data: sourceAssignments.map((assignment) => ({
        userId: assignment.userId,
        roleId: targetRoleId,
        assignedAt: assignment.assignedAt,
      })),
      skipDuplicates: true,
    });
  }

  await transaction.role.delete({ where: { id: sourceRoleId } });
}

/**
 * 查找、创建或迁移一条系统角色定义。
 *
 * @param transaction 当前数据库事务。
 * @param roleDefinition 共享契约中的系统角色定义。
 * @returns 同步后的系统角色主键。
 */
async function syncSystemRole(
  transaction: Prisma.TransactionClient,
  roleDefinition: (typeof SYSTEM_ROLE_DEFINITIONS)[number],
): Promise<number> {
  const aliases = LEGACY_ROLE_ALIASES[roleDefinition.code] ?? [];
  const legacyIdentifiers = [roleDefinition.code, ...aliases];
  const candidates = await transaction.role.findMany({
    where: {
      OR: [
        { code: { in: legacyIdentifiers } },
        { name: { in: [...legacyIdentifiers, roleDefinition.name] } },
      ],
    },
    orderBy: { id: 'asc' },
  });

  let targetRole = candidates.find(
    (candidate) => candidate.code === roleDefinition.code,
  );

  if (!targetRole && candidates.length === 1) {
    targetRole = candidates[0];
  }

  if (!targetRole && candidates.length > 1) {
    throw new Error(
      `系统角色 ${roleDefinition.code} 匹配到多条旧角色，无法安全决定迁移目标。`,
    );
  }

  if (!targetRole) {
    const createdRole = await transaction.role.create({
      data: {
        code: roleDefinition.code,
        name: roleDefinition.name,
        desc: roleDefinition.description,
        isSystem: true,
      },
    });

    return createdRole.id;
  }

  const duplicateRoles = candidates.filter(
    (candidate) => candidate.id !== targetRole.id,
  );

  for (const duplicateRole of duplicateRoles) {
    const isKnownLegacyRole = aliases.some(
      (alias) => duplicateRole.code === alias || duplicateRole.name === alias,
    );

    if (!isKnownLegacyRole) {
      throw new Error(
        `角色 ${duplicateRole.code} 与系统角色 ${roleDefinition.code} 的代码或名称冲突，已停止同步。`,
      );
    }

    await mergeLegacyRole(transaction, duplicateRole.id, targetRole.id);
  }

  const updatedRole = await transaction.role.update({
    where: { id: targetRole.id },
    data: {
      code: roleDefinition.code,
      name: roleDefinition.name,
      desc: roleDefinition.description,
      isSystem: true,
    },
  });

  return updatedRole.id;
}

/**
 * 同步四个系统角色，并迁移旧 MANAGER 角色的用户关系。
 *
 * @param transaction 当前数据库事务。
 * @returns 系统角色代码到数据库主键的只读映射。
 */
async function syncSystemRoles(
  transaction: Prisma.TransactionClient,
): Promise<SystemRoleIdMap> {
  const roleIds = new Map<SystemRoleCode, number>();

  for (const roleDefinition of SYSTEM_ROLE_DEFINITIONS) {
    const roleId = await syncSystemRole(transaction, roleDefinition);
    roleIds.set(roleDefinition.code, roleId);
  }

  return roleIds;
}

/**
 * 严格同步系统角色的默认授权，移除目录外授权并补齐目录内授权。
 *
 * @param transaction 当前数据库事务。
 * @param roleIds 已同步的系统角色主键映射。
 */
async function syncSystemRoleGrants(
  transaction: Prisma.TransactionClient,
  roleIds: SystemRoleIdMap,
): Promise<void> {
  const permissions = await transaction.permission.findMany({
    where: {
      code: {
        in: SYSTEM_PERMISSION_DEFINITIONS.map((permission) => permission.code),
      },
    },
    select: { id: true, code: true },
  });
  const permissionIds = new Map(
    permissions.map((permission) => [permission.code, permission.id]),
  );

  for (const roleDefinition of SYSTEM_ROLE_DEFINITIONS) {
    const roleId = roleIds.get(roleDefinition.code);

    if (!roleId) {
      throw new Error(`未找到已同步系统角色：${roleDefinition.code}`);
    }

    const definitionGrants =
      roleDefinition.code === 'SUPER_ADMIN'
        ? []
        : (roleDefinition.permissions as readonly SystemRoleGrantDefinition[]);
    const desiredGrants = definitionGrants.map((grant) => {
      const permissionId = permissionIds.get(grant.code);

      if (!permissionId) {
        throw new Error(`未找到已同步系统权限：${grant.code}`);
      }

      return {
        permissionId,
        permissionCode: grant.code,
        scopeType: toPrismaDataScope(grant.scopeType),
      };
    });
    const desiredGrantKeys = new Set(
      desiredGrants.map((grant) =>
        createGrantKey(grant.permissionCode, grant.scopeType),
      ),
    );
    const existingGrants = await transaction.rolePermission.findMany({
      where: { roleId },
      include: { perm: { select: { code: true } } },
    });
    const redundantGrantIds = existingGrants
      .filter(
        (grant) =>
          !desiredGrantKeys.has(
            createGrantKey(grant.perm.code, grant.scopeType),
          ),
      )
      .map((grant) => grant.id);

    if (redundantGrantIds.length > 0) {
      await transaction.rolePermission.deleteMany({
        where: { id: { in: redundantGrantIds } },
      });
    }

    const existingGrantKeys = new Set(
      existingGrants
        .filter((grant) => !redundantGrantIds.includes(grant.id))
        .map((grant) => createGrantKey(grant.perm.code, grant.scopeType)),
    );
    const missingGrants = desiredGrants.filter(
      (grant) =>
        !existingGrantKeys.has(
          createGrantKey(grant.permissionCode, grant.scopeType),
        ),
    );

    if (missingGrants.length > 0) {
      await transaction.rolePermission.createMany({
        data: missingGrants.map((grant) => ({
          roleId,
          permId: grant.permissionId,
          scopeType: grant.scopeType,
        })),
        skipDuplicates: true,
      });
    }
  }
}

/**
 * 在没有有效超级管理员时，安全选取并绑定首个超级管理员。
 *
 * @param transaction 当前数据库事务。
 * @param roleIds 已同步的系统角色主键映射。
 */
async function ensureEffectiveSuperAdmin(
  transaction: Prisma.TransactionClient,
  roleIds: SystemRoleIdMap,
): Promise<void> {
  const superAdminRoleId = roleIds.get('SUPER_ADMIN');
  const adminRoleId = roleIds.get('ADMIN');

  if (!superAdminRoleId || !adminRoleId) {
    throw new Error('系统角色目录缺少 SUPER_ADMIN 或 ADMIN。');
  }

  const effectiveSuperAdminCount = await transaction.user.count({
    where: {
      status: UserStatus.ACTIVE,
      roles: { some: { roleId: superAdminRoleId } },
    },
  });

  if (effectiveSuperAdminCount > 0) {
    return;
  }

  const activeAdminCandidates = await transaction.user.findMany({
    where: {
      status: UserStatus.ACTIVE,
      roles: { some: { roleId: adminRoleId } },
    },
    select: { id: true, email: true, status: true },
    orderBy: { id: 'asc' },
  });
  let candidate =
    activeAdminCandidates.length === 1 ? activeAdminCandidates[0] : null;

  if (!candidate) {
    const bootstrapEmail = process.env['BOOTSTRAP_SUPER_ADMIN_EMAIL']?.trim();

    if (!bootstrapEmail) {
      const reason =
        activeAdminCandidates.length > 1
          ? `检测到 ${activeAdminCandidates.length} 个有效 ADMIN，无法自动判断应升级的账号`
          : '未找到唯一有效 ADMIN，且未配置 BOOTSTRAP_SUPER_ADMIN_EMAIL';
      throw new Error(`${reason}，已安全停止同步。`);
    }

    candidate = await transaction.user.findUnique({
      where: { email: bootstrapEmail },
      select: { id: true, email: true, status: true },
    });

    if (!candidate || candidate.status !== UserStatus.ACTIVE) {
      throw new Error(
        'BOOTSTRAP_SUPER_ADMIN_EMAIL 未精确匹配有效用户，已安全停止同步。',
      );
    }
  }

  await transaction.userRole.upsert({
    where: {
      userId_roleId: { userId: candidate.id, roleId: superAdminRoleId },
    },
    create: { userId: candidate.id, roleId: superAdminRoleId },
    update: {},
  });
  await transaction.userRole.deleteMany({
    where: { userId: candidate.id, roleId: adminRoleId },
  });
}

/**
 * 在一个事务中完成权限目录、系统角色、默认授权与超级管理员同步。
 *
 * @param prisma Prisma 客户端。
 */
async function synchronizeAccessControlCatalog(
  prisma: PrismaClient,
): Promise<void> {
  await prisma.$transaction(
    async (transaction) => {
      await syncSystemPermissions(transaction);
      const roleIds = await syncSystemRoles(transaction);
      await syncSystemRoleGrants(transaction, roleIds);
      await ensureEffectiveSuperAdmin(transaction, roleIds);
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
}

/**
 * 比较数据库系统权限与共享契约目录，并追加漂移说明。
 *
 * @param prisma Prisma 客户端。
 * @param report 当前漂移报告。
 */
async function checkSystemPermissionDrift(
  prisma: PrismaClient,
  report: AccessControlDriftReport,
): Promise<void> {
  const storedPermissions = await prisma.permission.findMany({
    select: {
      code: true,
      name: true,
      module: true,
      action: true,
      desc: true,
      kind: true,
    },
  });
  const storedPermissionMap = new Map(
    storedPermissions.map((permission) => [permission.code, permission]),
  );
  const systemPermissionCodes = new Set<string>(
    SYSTEM_PERMISSION_DEFINITIONS.map((permission) => permission.code),
  );

  for (const definition of SYSTEM_PERMISSION_DEFINITIONS) {
    const storedPermission = storedPermissionMap.get(definition.code);

    if (!storedPermission) {
      report.issues.push(`缺少系统权限 ${definition.code}`);
      continue;
    }

    const hasMetadataDrift =
      storedPermission.name !== definition.name ||
      storedPermission.module !== definition.module ||
      storedPermission.action !== definition.action ||
      storedPermission.desc !== definition.description ||
      storedPermission.kind !== PermissionKind.SYSTEM;

    if (hasMetadataDrift) {
      report.issues.push(
        `系统权限 ${definition.code} 的元数据与代码目录不一致`,
      );
    }
  }

  for (const permission of storedPermissions) {
    if (
      !systemPermissionCodes.has(permission.code) &&
      permission.kind === PermissionKind.SYSTEM
    ) {
      report.issues.push(`目录外权限 ${permission.code} 仍被标记为 SYSTEM`);
    }

    if (
      isLegacyPermissionCode(permission.code) &&
      permission.kind !== PermissionKind.LEGACY
    ) {
      report.issues.push(`旧权限 ${permission.code} 尚未标记为 LEGACY`);
    }
  }
}

/**
 * 比较系统角色元数据与默认授权，并追加漂移说明。
 *
 * @param prisma Prisma 客户端。
 * @param report 当前漂移报告。
 */
async function checkSystemRoleDrift(
  prisma: PrismaClient,
  report: AccessControlDriftReport,
): Promise<void> {
  const legacyRoleAliases = getLegacyRoleAliases();
  const storedRoles = await prisma.role.findMany({
    where: {
      OR: [
        {
          code: {
            in: SYSTEM_ROLE_DEFINITIONS.map((role) => role.code),
          },
        },
        { code: { in: legacyRoleAliases } },
        { name: { in: legacyRoleAliases } },
      ],
    },
    include: {
      perms: { include: { perm: { select: { code: true } } } },
    },
  });
  const storedRoleMap = new Map(storedRoles.map((role) => [role.code, role]));

  for (const definition of SYSTEM_ROLE_DEFINITIONS) {
    const storedRole = storedRoleMap.get(definition.code);

    if (!storedRole) {
      report.issues.push(`缺少系统角色 ${definition.code}`);
      continue;
    }

    if (
      storedRole.name !== definition.name ||
      storedRole.desc !== definition.description ||
      !storedRole.isSystem
    ) {
      report.issues.push(
        `系统角色 ${definition.code} 的元数据与代码目录不一致`,
      );
    }

    const definitionGrants =
      definition.code === 'SUPER_ADMIN'
        ? []
        : (definition.permissions as readonly SystemRoleGrantDefinition[]);
    const desiredGrantKeys = new Set(
      definitionGrants.map((grant) =>
        createGrantKey(grant.code, grant.scopeType),
      ),
    );
    const storedGrantKeys = new Set(
      storedRole.perms.map((grant) =>
        createGrantKey(grant.perm.code, grant.scopeType),
      ),
    );
    const grantsMatch =
      desiredGrantKeys.size === storedGrantKeys.size &&
      [...desiredGrantKeys].every((grantKey) => storedGrantKeys.has(grantKey));

    if (!grantsMatch) {
      report.issues.push(`系统角色 ${definition.code} 的默认授权发生漂移`);
    }
  }

  for (const aliases of Object.values(LEGACY_ROLE_ALIASES)) {
    for (const alias of aliases) {
      const legacyRole = storedRoles.find(
        (role) => role.code === alias || role.name === alias,
      );

      if (legacyRole) {
        report.issues.push(`旧角色 ${alias} 尚未迁移到 V2 系统角色`);
      }
    }
  }
}

/**
 * 检查数据库中是否至少保留一个有效超级管理员。
 *
 * @param prisma Prisma 客户端。
 * @param report 当前漂移报告。
 */
async function checkEffectiveSuperAdmin(
  prisma: PrismaClient,
  report: AccessControlDriftReport,
): Promise<void> {
  const effectiveSuperAdminCount = await prisma.user.count({
    where: {
      status: UserStatus.ACTIVE,
      roles: { some: { role: { code: 'SUPER_ADMIN' } } },
    },
  });

  if (effectiveSuperAdminCount === 0) {
    report.issues.push('系统中没有状态为 ACTIVE 的超级管理员');
  }
}

/**
 * 以只读方式检查系统权限目录、系统角色授权和超级管理员状态。
 *
 * @param prisma Prisma 客户端。
 * @returns 汇总全部问题的漂移报告。
 */
async function checkAccessControlCatalog(
  prisma: PrismaClient,
): Promise<AccessControlDriftReport> {
  const report: AccessControlDriftReport = { issues: [] };

  await checkSystemPermissionDrift(prisma, report);
  await checkSystemRoleDrift(prisma, report);
  await checkEffectiveSuperAdmin(prisma, report);

  return report;
}

/**
 * 打印只读漂移检查结果，并在发现漂移时设置非零退出码。
 *
 * @param report 权限目录漂移报告。
 */
function printDriftReport(report: AccessControlDriftReport): void {
  if (report.issues.length === 0) {
    console.info('权限目录检查通过：数据库与代码目录一致。');
    return;
  }

  console.error(`权限目录检查失败，共发现 ${report.issues.length} 项漂移：`);

  for (const [index, issue] of report.issues.entries()) {
    console.error(`${index + 1}. ${issue}`);
  }

  process.exitCode = 1;
}

/**
 * 执行权限目录同步或只读漂移检查，并确保数据库连接被关闭。
 */
async function main(): Promise<void> {
  validateCatalogDefinitions();

  const mode = resolveMode();
  const prisma = createPrismaClient();

  try {
    await prisma.$connect();

    if (mode === 'check') {
      const report = await checkAccessControlCatalog(prisma);
      printDriftReport(report);
      return;
    }

    await synchronizeAccessControlCatalog(prisma);
    console.info('权限目录同步完成。');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`权限目录脚本执行失败：${message}`);
  process.exitCode = 1;
});
