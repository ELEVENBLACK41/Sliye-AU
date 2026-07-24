/**
 * 本文件提供当前登录用户的个人信息页面入口。
 */
import { requireAuthenticatedUser } from '@/features/auth/services/auth-server.service';
import { ProfilePage } from '@/features/profile/components/profile-page';

/** 服务端读取最新认证资料并渲染个人信息页面。 */
export default async function Page() {
  const currentUser = await requireAuthenticatedUser();

  return <ProfilePage initialUser={currentUser} />;
}
