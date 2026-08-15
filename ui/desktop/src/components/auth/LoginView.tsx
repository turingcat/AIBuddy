import { useState } from 'react';
import { login } from '../../login';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card } from '../ui/card';
import { Goose } from '../icons/Goose';

/**
 * @author logic
 * @date 2026-08-11
 * 登录页：表单提交后调用真实 OA 登录，写入凭证并重启应用让新凭证生效
 */
export default function LoginView() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const creds = await login(account, password);
      await window.electron.setLoginCredentials(creds);
      // 重启整个应用，让新凭证随全新 goose serve 子进程生效（凭证是 spawn 时固定的环境变量）
      // @author logic
      // @date 2026-08-13
      window.electron.restartApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-background-primary flex flex-col items-center justify-center px-4">
      <Card className="w-full max-w-sm p-6">
        <Goose className="size-10 mx-auto mb-4" />
        <h1 className="text-xl font-light text-text-primary text-center mb-1">登录 HeyBuddy</h1>
        <p className="text-text-secondary text-sm text-center mb-6">请使用公司OA登录</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-text-secondary text-xs">登录名</span>
            <Input
              className="mt-1"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              aria-label="login-name"
            />
          </label>
          <label className="block">
            <span className="text-text-secondary text-xs">密码</span>
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-label="password"
            />
          </label>
          {error && <p className="text-background-danger text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting} aria-label="login">
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
