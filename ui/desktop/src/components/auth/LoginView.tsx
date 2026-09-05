import { useState } from 'react';
import { login } from '../../login';
import { Goose } from '../icons/Goose';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';

export default function LoginView() {
  return <HeyBuddyLoginForm />;
}

function HeyBuddyLoginForm() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const creds = await login(account, password);
      await window.electron.setLoginCredentials(creds);
      await window.electron.refreshAuthSession();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background-primary px-4">
      <Card className="w-full max-w-sm p-6">
        <Goose className="mx-auto mb-4 size-10" />
        <h1 className="mb-1 text-center text-xl font-light text-text-primary">登录 HeyBuddy</h1>
        <p className="mb-6 text-center text-sm text-text-secondary">请使用公司OA账号登录</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs text-text-secondary">登录名</span>
            <Input
              className="mt-1"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              aria-label="login-name"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary">密码</span>
            <Input
              className="mt-1"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-label="password"
            />
          </label>
          {error && <p className="break-words text-sm text-background-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting} aria-label="login">
            {submitting ? '登录中…' : '登录'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
