import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatBrand from './ChatBrand';

describe('ChatBrand', () => {
  it('preserves HeyBuddy identity and repository destination', () => {
    render(<ChatBrand />);

    expect(screen.getByRole('link', { name: /HeyBuddy/ })).toHaveAttribute(
      'href',
      'https://github.com/turingcat/HeyBuddy'
    );
    expect(screen.getByText('HeyBuddy')).toBeInTheDocument();
  });
});
