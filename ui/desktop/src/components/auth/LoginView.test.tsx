import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AIBuddyLoginForm', () => ({
  default: () => <div>AIBuddy login form</div>,
}));

import LoginView from './LoginView';

describe('LoginView', () => {
  it('always renders the AIBuddy login form', () => {
    render(<LoginView />);

    expect(screen.getByText('AIBuddy login form')).toBeInTheDocument();
  });
});
