/**
 * 本文件验证头像本地存储的格式校验、安全文件名和文件生命周期。
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AvatarStorageService,
  MAX_AVATAR_FILE_SIZE,
  type AvatarUploadFile,
} from './avatar-storage.service';

/** 创建带有真实 PNG 文件头的最小测试文件。 */
function createPngFile(): AvatarUploadFile {
  const buffer = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
  ]);

  return {
    originalname: 'avatar.png',
    mimetype: 'image/png',
    size: buffer.length,
    buffer,
  };
}

describe('AvatarStorageService', () => {
  let storageRoot: string;
  let service: AvatarStorageService;

  /** 为每个测试创建独立临时目录和存储服务。 */
  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'nextnest-avatar-'));
    service = new AvatarStorageService({
      get: () => storageRoot,
    } as unknown as ConfigService);
  });

  /** 测试结束后只清理本测试创建的独立临时目录。 */
  afterEach(async () => {
    await rm(storageRoot, { recursive: true, force: true });
  });

  it('应保存并读取具有真实文件签名的 PNG 头像', async () => {
    const avatarUrl = await service.save(12, createPngFile());
    const fileName = avatarUrl.replace('/api/profile/avatar/', '');
    const stored = await service.read(fileName);

    expect(fileName).toMatch(/^12-[0-9a-f-]{36}\.png$/);
    expect(stored.contentType).toBe('image/png');
    expect(stored.buffer).toEqual(createPngFile().buffer);
  });

  it('不应接受只有 MIME 正确但文件签名伪造的头像', async () => {
    const file = createPngFile();
    file.buffer = Buffer.from('not-a-real-png');
    file.size = file.buffer.length;

    await expect(service.save(12, file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('不应接受超过服务端限制的头像', async () => {
    const file = createPngFile();
    file.buffer = Buffer.alloc(MAX_AVATAR_FILE_SIZE + 1);
    file.size = file.buffer.length;

    await expect(service.save(12, file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('应拒绝读取包含路径穿越的外部文件名', async () => {
    await expect(service.read('../avatar.png')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('移除头像后再次读取应返回不存在', async () => {
    const avatarUrl = await service.save(12, createPngFile());
    const fileName = avatarUrl.replace('/api/profile/avatar/', '');

    await service.removeByUrl(avatarUrl);

    await expect(service.read(fileName)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
