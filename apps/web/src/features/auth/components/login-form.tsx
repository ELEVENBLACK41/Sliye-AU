/**
 * 本文件实现登录、公开注册和邮箱验证三种认证表单状态。
 */
'use client';

import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { LOGIN_REDIRECT_PATH } from '@/features/auth/constants';
import { confirmEmail, login, register, sendEmailVerification } from '@/features/auth/services/auth-client.service';
import type {
  ConfirmEmailFormValues,
  EmailVerificationState,
  LoginFormValues,
  RegisterFormValues,
} from '@/features/auth/types/auth.type';
import { AUTH_SESSION_CHANGED_EVENT } from '@/features/notifications/constants';
import { Alert, AlertDescription } from '@workspace/ui/components/alert';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';

/** 登录表单初始值。 */
const INITIAL_LOGIN_VALUES: LoginFormValues = {
  email: '',
  password: '',
};

/** 注册表单初始值。 */
const INITIAL_REGISTER_VALUES: RegisterFormValues = {
  email: '',
  password: '',
  name: '',
};

/** 邮箱验证码确认表单初始值。 */
const INITIAL_CONFIRM_VALUES: ConfirmEmailFormValues = {
  email: '',
  code: '',
};

/** 认证表单属性。 */
type LoginFormProps = {
  /** 登录或验证成功后允许跳转的站内路径。 */
  redirectTo?: string;
};

/** 当前认证表单展示的业务模式。 */
type AuthMode = 'login' | 'register' | 'confirm';

/** 渲染登录、注册和邮箱验证表单，并维护三种模式之间的安全切换。 */
export function LoginForm({ redirectTo = LOGIN_REDIRECT_PATH }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [loginValues, setLoginValues] = useState<LoginFormValues>(INITIAL_LOGIN_VALUES);
  const [registerValues, setRegisterValues] = useState<RegisterFormValues>(INITIAL_REGISTER_VALUES);
  const [confirmValues, setConfirmValues] = useState<ConfirmEmailFormValues>(INITIAL_CONFIRM_VALUES);
  const [emailVerification, setEmailVerification] = useState<EmailVerificationState | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [noticeMessage, setNoticeMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastCodeSentAt, setLastCodeSentAt] = useState<number | null>(null);

  useEffect(() => {
    if (mode !== 'confirm') {
      return;
    }

    const timer = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(timer);
  }, [mode]);

  const canLogin = loginValues.email.trim().length > 0 && loginValues.password.trim().length > 0;
  const canRegister = registerValues.email.trim().length > 0 && registerValues.password.length >= 8;
  const canConfirm = confirmValues.email.trim().length > 0 && /^\d{6}$/.test(confirmValues.code.trim());
  const secondsUntilExpiry = emailVerification?.expiresAt
    ? Math.max(0, Math.ceil((new Date(emailVerification.expiresAt).getTime() - now) / 1000))
    : null;
  const cooldownSeconds =
    emailVerification && lastCodeSentAt
      ? Math.max(0, emailVerification.cooldownSeconds - Math.floor((now - lastCodeSentAt) / 1000))
      : 0;
  const canResend = mode === 'confirm' && cooldownSeconds <= 0 && !isSubmitting;

  /** 校验登录表单后调用 BFF，并在成功后进入原目标页面。 */
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canLogin || isSubmitting) {
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await login({
        ...loginValues,
        email: loginValues.email.trim(),
      });
      setLoginValues((current) => ({
        ...current,
        password: '',
      }));
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '登录失败，请稍后再试');
    } finally {
      setLoginValues((current) => ({
        ...current,
        password: '',
      }));
      setIsSubmitting(false);
    }
  }

  /** 注册新账号并切换到邮箱验证码确认模式。 */
  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canRegister || isSubmitting) {
      return;
    }

    setErrorMessage('');
    setNoticeMessage('');
    setIsSubmitting(true);

    try {
      const result = await register({
        ...registerValues,
        email: registerValues.email.trim(),
        name: registerValues.name.trim(),
      });
      const email = result.emailVerification.sentTo || registerValues.email;
      const currentTime = Date.now();

      setRegisterValues((current) => ({
        ...current,
        password: '',
      }));
      setConfirmValues({
        email,
        code: '',
      });
      setEmailVerification(result.emailVerification);
      setLastCodeSentAt(currentTime);
      setNow(currentTime);
      setMode('confirm');
      setNoticeMessage('注册成功，验证码已生成，请查看 Nest 后端日志。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '注册失败，请稍后再试');
    } finally {
      setRegisterValues((current) => ({
        ...current,
        password: '',
      }));
      setIsSubmitting(false);
    }
  }

  /** 确认邮箱验证码，成功后建立登录 Cookie 并进入目标页面。 */
  async function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canConfirm || isSubmitting || secondsUntilExpiry === 0) {
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    try {
      await confirmEmail({
        email: confirmValues.email.trim(),
        code: confirmValues.code.trim(),
      });
      setConfirmValues((current) => ({
        ...current,
        code: '',
      }));
      window.dispatchEvent(new Event(AUTH_SESSION_CHANGED_EVENT));
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '验证失败，请稍后再试');
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 在冷却结束后重新发送邮箱验证码。 */
  async function handleResendCode() {
    if (!canResend) {
      return;
    }

    setErrorMessage('');
    setNoticeMessage('');
    setIsSubmitting(true);

    try {
      const result = await sendEmailVerification({
        email: confirmValues.email.trim(),
      });
      const currentTime = Date.now();

      setEmailVerification(result);
      setLastCodeSentAt(currentTime);
      setNow(currentTime);
      setConfirmValues((current) => ({
        ...current,
        code: '',
      }));
      setNoticeMessage('验证码已重新生成，请查看 Nest 后端日志。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '发送验证码失败，请稍后再试');
    } finally {
      setIsSubmitting(false);
    }
  }

  /** 切换认证模式并清理上一模式的提示信息。 */
  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage('');
    setNoticeMessage('');
  }

  if (mode === 'register') {
    return (
      <Card className="w-full rounded-md shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">注册账号</CardTitle>
          <CardDescription>创建 Decision Hub 账号</CardDescription>
        </CardHeader>
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-5">
            {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

            <div className="space-y-2">
              <Label htmlFor="register-name">姓名</Label>
              <Input
                id="register-name"
                name="name"
                placeholder="你的名字"
                autoComplete="name"
                value={registerValues.name}
                onChange={(event) =>
                  setRegisterValues((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-email">邮箱</Label>
              <Input
                id="register-email"
                name="email"
                type="email"
                placeholder="you@example.com"
                autoComplete="username"
                value={registerValues.email}
                aria-invalid={Boolean(errorMessage)}
                onChange={(event) =>
                  setRegisterValues((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-password">密码</Label>
              <Input
                id="register-password"
                name="password"
                type="password"
                placeholder="8-128 位密码"
                autoComplete="new-password"
                value={registerValues.password}
                aria-invalid={Boolean(errorMessage)}
                onChange={(event) =>
                  setRegisterValues((current) => ({
                    ...current,
                    password: event.target.value,
                  }))
                }
              />
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3 pt-6">
            <Button type="submit" className="w-full" disabled={!canRegister || isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
              注册
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode('login')}>
              已有账号，去登录
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  if (mode === 'confirm') {
    return (
      <Card className="w-full rounded-md shadow-none">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl">验证邮箱</CardTitle>
          <CardDescription>输入 Nest 日志中的 6 位验证码</CardDescription>
        </CardHeader>
        <form onSubmit={handleConfirm}>
          <CardContent className="space-y-5">
            {noticeMessage ? (
              <Alert>
                <AlertDescription>{noticeMessage}</AlertDescription>
              </Alert>
            ) : null}

            {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

            {secondsUntilExpiry !== null ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                <p>发送邮箱：{emailVerification?.sentTo}</p>
                <p>有效期剩余：{formatDuration(secondsUntilExpiry)}</p>
                {secondsUntilExpiry === 0 ? <p className="text-destructive">验证码已过期，请重新发送。</p> : null}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="confirm-email">邮箱</Label>
              <Input
                id="confirm-email"
                name="email"
                type="email"
                autoComplete="username"
                value={confirmValues.email}
                onChange={(event) =>
                  setConfirmValues((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-code">验证码</Label>
              <Input
                id="confirm-code"
                name="code"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={confirmValues.code}
                aria-invalid={Boolean(errorMessage)}
                onChange={(event) =>
                  setConfirmValues((current) => ({
                    ...current,
                    code: event.target.value.replace(/\D/g, '').slice(0, 6),
                  }))
                }
              />
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-3 pt-6">
            <Button type="submit" className="w-full" disabled={!canConfirm || isSubmitting || secondsUntilExpiry === 0}>
              {isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
              完成验证并登录
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={!canResend} onClick={handleResendCode}>
              {cooldownSeconds > 0 ? `${cooldownSeconds} 秒后可重新发送` : '重新发送验证码'}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode('login')}>
              返回登录
            </Button>
          </CardFooter>
        </form>
      </Card>
    );
  }

  return (
    <Card className="w-full rounded-md shadow-none">
      <CardHeader className="space-y-2">
        <CardTitle className="text-2xl">账号登录</CardTitle>
        <CardDescription>使用已注册邮箱和密码登录</CardDescription>
      </CardHeader>
      <form onSubmit={handleLogin}>
        <CardContent className="space-y-5">
          {errorMessage ? <ErrorAlert message={errorMessage} /> : null}

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="username"
              value={loginValues.email}
              aria-invalid={Boolean(errorMessage)}
              onChange={(event) =>
                setLoginValues((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="至少 8 位密码"
              autoComplete="current-password"
              value={loginValues.password}
              aria-invalid={Boolean(errorMessage)}
              onChange={(event) =>
                setLoginValues((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-3 pt-6">
          <Button type="submit" className="w-full" disabled={!canLogin || isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <LogIn className="size-4" aria-hidden />
            )}
            登录
          </Button>
          <Button type="button" variant="ghost" className="w-full" onClick={() => switchMode('register')}>
            没有账号，先注册
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/** 渲染认证流程的统一错误提示。 */
function ErrorAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="size-4" aria-hidden />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/** 把验证码剩余秒数格式化为 `mm:ss`。 */
function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}
