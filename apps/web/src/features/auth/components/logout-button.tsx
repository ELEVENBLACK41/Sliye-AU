'use client';

import { Loader2, LogOut } from 'lucide-react';

import { useLogout } from '@/features/auth/hooks/use-logout';
import { Button } from '@workspace/ui/components/button';

/** 渲染通用按钮形态的退出登录入口。 */
export function LogoutButton() {
  const { isPending, logout } = useLogout();

  return (
    <Button type="button" variant="outline" onClick={logout} disabled={isPending}>
      {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <LogOut className="size-4" aria-hidden />}
      退出
    </Button>
  );
}
