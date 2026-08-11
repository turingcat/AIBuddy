import { useState } from 'react';
import { useNavigate } from 'react-router';
import { stubLogin } from '../../stubLogin';

/**
 * @author logic
 * @date 2026-08-11
 * 登录页：表单提交后调用桩登录，写入凭证并跳转主界面；阶段三替换 stubLogin 即接通真实服务端
 */
export default function LoginView() {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const creds = await stubLogin(account, password);
      await window.electron.setLoginCredentials(creds);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-background-default flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-light">登录 HeyBuddy</h1>
        <label className="block">
          <span className="text-text-muted">账号</span>
          <input
            className="block w-full mt-1 p-2 border rounded"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            aria-label="account"
          />
        </label>
        <label className="block">
          <span className="text-text-muted">密码</span>
          <input
            type="password"
            className="block w-full mt-1 p-2 border rounded"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-label="password"
          />
        </label>
        {error && <p className="text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full p-2 bg-primary text-white rounded"
          aria-label="login"
        >
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
