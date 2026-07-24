/**
 * 本文件实现个人信息页面，支持头像上传、头像移除和显示名称修改。
 */
'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Building2, CalendarDays, CircleCheckBig, Mail, ShieldCheck, Upload } from 'lucide-react';
import type { AuthUser } from '@workspace/contracts/auth';

import { removeAvatar, updateProfile, uploadAvatar } from '@/features/profile/services/profile-client.service';
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@workspace/ui/components/avatar';
import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { Separator } from '@workspace/ui/components/separator';

/** 浏览器端提前拦截的头像大小限制，与服务端 2 MiB 限制保持一致。 */
const MAX_AVATAR_FILE_SIZE = 2 * 1024 * 1024;

/** 浏览器文件选择器允许的头像 MIME 类型。 */
const ALLOWED_AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** 个人信息页面属性。 */
type ProfilePageProps = {
  /** 服务端实时读取的当前认证用户。 */
  initialUser: AuthUser;
};

/** 渲染当前用户资料、头像管理和只读账号信息。 */
export function ProfilePage({ initialUser }: ProfilePageProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState(initialUser);
  const [name, setName] = useState(initialUser.name ?? '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [avatarPending, setAvatarPending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /** 组件卸载或预览替换时释放浏览器 Blob URL。 */
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /** 选择并在浏览器侧预校验头像文件。 */
  function handleAvatarSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setMessage(null);

    if (!file) {
      clearSelectedAvatar();
      return;
    }

    if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
      setMessage({ type: 'error', text: '头像仅支持 JPG、PNG 或 WebP 格式。' });
      clearSelectedAvatar();
      return;
    }

    if (file.size > MAX_AVATAR_FILE_SIZE) {
      setMessage({ type: 'error', text: '头像文件不能超过 2MB。' });
      clearSelectedAvatar();
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  /** 上传当前已选择的头像并刷新布局中的用户资料。 */
  async function handleAvatarUpload() {
    if (!selectedFile) {
      setMessage({ type: 'error', text: '请先选择需要上传的头像。' });
      return;
    }

    setAvatarPending(true);
    setMessage(null);

    try {
      const result = await uploadAvatar(selectedFile);
      setUser(result.user);
      clearSelectedAvatar();
      setMessage({ type: 'success', text: '头像已更新。' });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, '头像上传失败，请稍后再试。') });
    } finally {
      setAvatarPending(false);
    }
  }

  /** 移除当前头像并恢复为名称首字母占位。 */
  async function handleAvatarRemove() {
    setAvatarPending(true);
    setMessage(null);

    try {
      const result = await removeAvatar();
      setUser(result.user);
      clearSelectedAvatar();
      setMessage({ type: 'success', text: '头像已移除。' });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, '头像移除失败，请稍后再试。') });
    } finally {
      setAvatarPending(false);
    }
  }

  /** 提交显示名称修改并刷新服务端布局。 */
  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();

    if (!normalizedName) {
      setMessage({ type: 'error', text: '显示名称不能为空。' });
      return;
    }

    setProfilePending(true);
    setMessage(null);

    try {
      const updatedUser = await updateProfile({ name: normalizedName });
      setUser(updatedUser);
      setName(updatedUser.name ?? '');
      setMessage({ type: 'success', text: '个人资料已保存。' });
      router.refresh();
    } catch (error) {
      setMessage({ type: 'error', text: getErrorMessage(error, '个人资料保存失败，请稍后再试。') });
    } finally {
      setProfilePending(false);
    }
  }

  /** 清理待上传文件与本地预览。 */
  function clearSelectedAvatar() {
    setSelectedFile(null);
    setPreviewUrl(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">账号设置</p>
        <h1 className="text-2xl font-semibold tracking-tight">个人信息</h1>
        <p className="mt-1 text-sm text-muted-foreground">维护你的头像和显示名称，组织与权限信息由管理员统一管理。</p>
      </div>

      {message ? (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'success' ? <CircleCheckBig aria-hidden /> : null}
          <AlertTitle>{message.type === 'success' ? '操作成功' : '操作失败'}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <div className="space-y-6">
          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle>头像</CardTitle>
              <CardDescription>支持 JPG、PNG 和 WebP，文件大小不超过 2MB。</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <Avatar size="lg" className="size-24 text-2xl">
                <AvatarImage src={previewUrl ?? user.avatarUrl ?? undefined} alt={`${user.name || user.email}的头像`} />
                <AvatarFallback>{getUserInitial(user)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="avatar">选择头像文件</Label>
                  <Input
                    ref={fileInputRef}
                    id="avatar"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={avatarPending}
                    onChange={handleAvatarSelection}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" disabled={!selectedFile || avatarPending} onClick={handleAvatarUpload}>
                    <Upload aria-hidden />
                    {avatarPending ? '处理中...' : '上传头像'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={(!user.avatarUrl && !selectedFile) || avatarPending}
                    onClick={selectedFile ? clearSelectedAvatar : handleAvatarRemove}
                  >
                    {selectedFile ? '取消选择' : '移除头像'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-md shadow-none">
            <CardHeader>
              <CardTitle>基本资料</CardTitle>
              <CardDescription>显示名称会出现在讨论、提案、投票和会议记录中。</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-5" onSubmit={handleProfileSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="name">显示名称</Label>
                  <Input
                    id="name"
                    value={name}
                    maxLength={40}
                    autoComplete="name"
                    disabled={profilePending}
                    onChange={(event) => setName(event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">最多 40 个字符。</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">登录邮箱</Label>
                  <Input id="email" value={user.email} disabled readOnly />
                  <p className="text-xs text-muted-foreground">邮箱暂不支持自行修改。</p>
                </div>
                <Button type="submit" disabled={profilePending || name.trim() === (user.name ?? '')}>
                  {profilePending ? '保存中...' : '保存基本资料'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit rounded-md shadow-none">
          <CardHeader>
            <CardTitle>账号信息</CardTitle>
            <CardDescription>以下信息由系统和管理员维护。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProfileInfo
              icon={<Building2 aria-hidden />}
              label="所属部门"
              value={user.department?.name ?? '尚未分配部门'}
            />
            <Separator />
            <ProfileInfo
              icon={<ShieldCheck aria-hidden />}
              label="当前角色"
              value={user.roles.map((role) => role.name).join('、') || '尚未分配角色'}
            />
            <Separator />
            <ProfileInfo
              icon={<BadgeCheck aria-hidden />}
              label="账号状态"
              value={formatUserStatus(user.status)}
              badge
            />
            <Separator />
            <ProfileInfo
              icon={<Mail aria-hidden />}
              label="邮箱验证"
              value={user.emailVerifiedAt ? '已验证' : '未验证'}
            />
            <Separator />
            <ProfileInfo icon={<CalendarDays aria-hidden />} label="加入时间" value={formatDateTime(user.createdAt)} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/** 单条只读账号资料属性。 */
type ProfileInfoProps = {
  /** 字段图标。 */
  icon: ReactNode;
  /** 字段中文名称。 */
  label: string;
  /** 字段展示值。 */
  value: string;
  /** 是否使用 Badge 强调字段值。 */
  badge?: boolean;
};

/** 渲染一条带图标的只读账号资料。 */
function ProfileInfo({ icon, label, value, badge = false }: ProfileInfoProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground [&>svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {badge ? (
          <Badge variant="secondary" className="mt-1">
            {value}
          </Badge>
        ) : (
          <p className="mt-1 text-sm font-medium">{value}</p>
        )}
      </div>
    </div>
  );
}

/** 获取头像占位使用的名称首字符。 */
function getUserInitial(user: AuthUser): string {
  return (user.name || user.email).trim().charAt(0).toUpperCase() || '?';
}

/** 把账号状态转换成中文。 */
function formatUserStatus(status: AuthUser['status']): string {
  return { PENDING: '待激活', ACTIVE: '正常', DISABLED: '已停用', LOCKED: '已锁定' }[status];
}

/** 把 ISO 日期格式化为中国地区可读时间。 */
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date(value));
}

/** 从未知异常中提取安全可展示的错误文案。 */
function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
