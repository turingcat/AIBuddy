import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ChatBrand from './ChatBrand';

describe('ChatBrand', () => {
  it('renders the AIBuddy identity and TFlow destination', () => {
    render(<ChatBrand />);

    expect(screen.getByRole('link', { name: /AIBuddy/ })).toHaveAttribute(
      'href',
      'https://tflow.online'
    );
    expect(screen.getByRole('img', { name: 'AIBuddy' })).toBeInTheDocument();
    expect(screen.queryByText('HeyBuddy')).not.toBeInTheDocument();
  });
});
