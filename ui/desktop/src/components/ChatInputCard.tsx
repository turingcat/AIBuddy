import React from 'react';
import { cn } from '../utils';

export const CHAT_INPUT_MAX_WIDTH_CLASS = 'max-w-4xl';

/**
 * Shared visual wrapper for the ChatInput.
 *
 * Both the Hub (empty-chat landing) and the BaseChat (active session)
 * present ChatInput as a floating rounded outlined card on the canvas.
 * Centralizing it here keeps the look in sync and gives a single place
 * to tweak the recipe.
 */
export const ChatInputCard: React.FC<{
  className?: string;
  children: React.ReactNode;
}> = ({ className, children }) => (
  <div
    className={cn(
      'w-full mx-auto rounded-2xl border border-border-primary shadow-sm overflow-hidden bg-background-primary',
      CHAT_INPUT_MAX_WIDTH_CLASS,
      className
    )}
  >
    {children}
  </div>
);
