import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import OnboardingGuard from './OnboardingGuard';

describe('OnboardingGuard', () => {
  // 保存原始 window.electron，测试结束后恢复，避免污染其他用例。
  const originalElectron = (window as { electron?: unknown }).electron;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    (window as { electron?: unknown }).electron = originalElectron;
  });

  /**
   * 守卫基于登录状态判定是否放行 children。
   * @author: logic
   * @date: 2026-08-11
   */
  it('未登录时不放行 children', async () => {
    const mockIsLoggedIn = vi.fn().mockResolvedValue(false);
    (window as unknown as { electron: { isLoggedIn: typeof mockIsLoggedIn } }).electron = {
      isLoggedIn: mockIsLoggedIn,
    };
    render(
      <MemoryRouter>
        <OnboardingGuard>
          <div>child</div>
        </OnboardingGuard>
      </MemoryRouter>
    );
    // 等待登录检查发起，确保后续断言基于检查完成后的状态
    await waitFor(() => expect(mockIsLoggedIn).toHaveBeenCalled());
    // 未登录时 children 不应被渲染（守卫重定向到 /login）
    await expect(
      screen.findByText('child', undefined, { timeout: 500 })
    ).rejects.toThrow();
  });

  it('已登录时放行 children', async () => {
    const mockIsLoggedIn = vi.fn().mockResolvedValue(true);
    (window as unknown as { electron: { isLoggedIn: typeof mockIsLoggedIn } }).electron = {
      isLoggedIn: mockIsLoggedIn,
    };
    render(
      <MemoryRouter>
        <OnboardingGuard>
          <div>child</div>
        </OnboardingGuard>
      </MemoryRouter>
    );
    expect(await screen.findByText('child', undefined, { timeout: 3000 })).toBeInTheDocument();
  });
});
