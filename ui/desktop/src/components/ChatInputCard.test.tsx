import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatInputCard, CHAT_INPUT_MAX_WIDTH_CLASS } from './ChatInputCard';

describe('ChatInputCard', () => {
  it('centers chat inputs with the shared desktop maximum width', () => {
    render(<ChatInputCard>输入区</ChatInputCard>);

    expect(screen.getByText('输入区')).toHaveClass(
      'w-full',
      'mx-auto',
      CHAT_INPUT_MAX_WIDTH_CLASS
    );
  });
});
