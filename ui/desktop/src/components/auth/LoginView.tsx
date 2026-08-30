import { useState } from 'react';
import { getAppEdition } from '../../brand';
import { login } from '../../login';
import { Goose } from '../icons/Goose';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import AIBuddyLoginForm from './AIBuddyLoginForm';

export default function LoginView() {
  if (getAppEdition() === 'aibuddy') {
    return <AIBuddyLoginForm />;
  }

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
      window.electron.restartApp();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background-primary px-4">
      <Card className="w-full max-w-sm p-6">
        <Goose className="mx-auto mb-4 size-10" />
        <h1 className="mb-1 text-center text-xl font-light text-text-primary">Login HeyBuddy</h1>
        <p className="mb-6 text-center text-sm text-text-secondary">Use your company OA account</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-xs text-text-secondary">Login name</span>
            <Input
              className="mt-1"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              aria-label="login-name"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary">Password</span>
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
            {submitting ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
