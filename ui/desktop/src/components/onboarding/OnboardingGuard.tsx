import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

/**
 * 主视图守卫：根据登录状态决定是否放行 children。
 * 登录检查通过后放行；未登录时重定向到 /login。
 * @author: logic
 * @date: 2026-08-11
 */
export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const checkLogin = async () => {
    setIsChecking(true);
    try {
      const loggedIn = await window.electron.isLoggedIn();
      setIsLoggedIn(loggedIn);
    } catch (error) {
      console.error('Failed to check login status:', error);
      setIsLoggedIn(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    checkLogin();
  }, []);

  if (isChecking) {
    return null;
  }

  if (isLoggedIn) {
    return <>{children}</>;
  }

  return <Navigate to="/login" replace />;
}
