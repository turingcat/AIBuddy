import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ChatBrand from './ChatBrand';

describe('ChatBrand', () => {
  it('renders AIBuddy identity and TFlow destination', () => {
    vi.stubEnv('APP_EDITION', 'aibuddy');

    render(<ChatBrand />);

    expect(screen.getByRole('link', { name: /AIBuddy/ })).toHaveAttribute(
      'href',
      'https://tflow.online'
    );
    expect(screen.getByRole('img', { name: 'AIBuddy' })).toBeInTheDocument();
  });

  it('preserves HeyBuddy identity and repository destination', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');

    render(<ChatBrand />);

    expect(screen.getByRole('link', { name: /HeyBuddy/ })).toHaveAttribute(
      'href',
      'https://github.com/turingcat/HeyBuddy'
    );
    expect(screen.getByText('HeyBuddy')).toBeInTheDocument();
  });
});
