/**
 * 本文件实现用户头像的本地文件存储，保持上传业务与未来对象存储实现解耦。
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

/** 单张头像允许的最大文件大小，当前限制为 2 MiB。 */
export const MAX_AVATAR_FILE_SIZE = 2 * 1024 * 1024;

/** Multer 内存存储提供给头像服务的安全文件字段。 */
export type AvatarUploadFile = {
  /** 原始文件名称，仅用于日志和校验，不参与落盘路径。 */
  originalname: string;
  /** 浏览器声明的文件 MIME 类型。 */
  mimetype: string;
  /** 文件字节大小。 */
  size: number;
  /** 已读取到内存的文件内容。 */
  buffer: Buffer;
};

/** 读取头像后供 HTTP 层返回的文件内容。 */
export type StoredAvatar = {
  /** 头像二进制内容。 */
  buffer: Buffer;
  /** 与真实文件签名匹配的 MIME 类型。 */
  contentType: string;
};

/** 支持的头像格式及其扩展名。 */
const AVATAR_FORMATS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

/** 本地头像存储服务；后续接入对象存储时可以替换本服务实现。 */
@Injectable()
export class AvatarStorageService {
  /** 头像文件落盘的绝对根目录。 */
  private readonly storageRoot: string;

  /** 从环境配置解析并固定头像存储目录。 */
  constructor(configService: ConfigService) {
    this.storageRoot = resolve(
      configService.get<string>('AVATAR_UPLOAD_DIR', './uploads/avatars'),
    );
  }

  /** 校验并保存新头像，返回浏览器通过 BFF 读取头像的稳定地址。 */
  async save(userId: number, file: AvatarUploadFile): Promise<string> {
    const extension = this.resolveVerifiedExtension(file);
    const fileName = `${userId}-${randomUUID()}.${extension}`;

    await mkdir(this.storageRoot, { recursive: true });
    await writeFile(this.resolveFilePath(fileName), file.buffer, {
      flag: 'wx',
    });

    return `/api/profile/avatar/${fileName}`;
  }

  /** 根据不可变文件名读取头像内容。 */
  async read(fileName: string): Promise<StoredAvatar> {
    const normalizedFileName = this.normalizeFileName(fileName);

    try {
      return {
        buffer: await readFile(this.resolveFilePath(normalizedFileName)),
        contentType: this.resolveContentType(normalizedFileName),
      };
    } catch (error) {
      if (this.isFileNotFound(error)) {
        throw new NotFoundException('头像不存在或已被移除');
      }

      throw error;
    }
  }

  /** 删除属于本地头像接口的旧文件；文件已经不存在时视为删除成功。 */
  async removeByUrl(avatarUrl: string | null | undefined): Promise<void> {
    if (!avatarUrl) {
      return;
    }

    const prefix = '/api/profile/avatar/';

    if (!avatarUrl.startsWith(prefix)) {
      return;
    }

    const fileName = this.normalizeFileName(avatarUrl.slice(prefix.length));

    try {
      await unlink(this.resolveFilePath(fileName));
    } catch (error) {
      if (!this.isFileNotFound(error)) {
        throw error;
      }
    }
  }

  /** 校验文件大小、MIME 和真实文件头，并返回可信扩展名。 */
  private resolveVerifiedExtension(file: AvatarUploadFile): string {
    if (!file.buffer.length || file.size <= 0) {
      throw new BadRequestException('请选择有效的头像文件');
    }

    if (
      file.size > MAX_AVATAR_FILE_SIZE ||
      file.buffer.length > MAX_AVATAR_FILE_SIZE
    ) {
      throw new BadRequestException('头像文件不能超过 2MB');
    }

    const extension =
      AVATAR_FORMATS[file.mimetype as keyof typeof AVATAR_FORMATS];

    if (!extension || !this.matchesFileSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('头像仅支持 JPG、PNG 或 WebP 格式');
    }

    return extension;
  }

  /** 根据允许格式校验二进制文件头，避免只信任浏览器提交的 MIME。 */
  private matchesFileSignature(buffer: Buffer, mimeType: string): boolean {
    if (mimeType === 'image/jpeg') {
      return (
        buffer.length >= 3 &&
        buffer[0] === 0xff &&
        buffer[1] === 0xd8 &&
        buffer[2] === 0xff
      );
    }

    if (mimeType === 'image/png') {
      return (
        buffer.length >= 8 &&
        buffer
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      );
    }

    return (
      mimeType === 'image/webp' &&
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }

  /** 将外部文件名限制为服务生成的安全格式。 */
  private normalizeFileName(fileName: string): string {
    const normalized = basename(fileName);

    if (
      normalized !== fileName ||
      !/^\d+-[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(normalized)
    ) {
      throw new NotFoundException('头像不存在或已被移除');
    }

    return normalized;
  }

  /** 在固定根目录下解析文件路径。 */
  private resolveFilePath(fileName: string): string {
    return resolve(this.storageRoot, fileName);
  }

  /** 根据已经校验的扩展名返回响应 MIME。 */
  private resolveContentType(fileName: string): string {
    const extension = extname(fileName).toLowerCase();

    if (extension === '.jpg') {
      return 'image/jpeg';
    }

    return extension === '.png' ? 'image/png' : 'image/webp';
  }

  /** 判断文件系统异常是否表示目标文件不存在。 */
  private isFileNotFound(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT',
    );
  }
}
