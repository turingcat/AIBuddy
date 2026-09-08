import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatBrand from './ChatBrand';

describe('ChatBrand', () => {
  it('preserves AIBuddy identity and repository destination', () => {
    render(<ChatBrand />);

    expect(screen.getByRole('link', { name: /AIBuddy/ })).toHaveAttribute(
      'href',
      'https://github.com/turingcat/AIBuddy'
    );
    expect(screen.getByText('AIBuddy')).toBeInTheDocument();
  });
});
