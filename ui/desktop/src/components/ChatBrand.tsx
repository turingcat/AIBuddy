import { AIBuddy } from './icons';

export default function ChatBrand() {
  return (
    <a
      href="https://github.com/turingcat/AIBuddy"
      target="_blank"
      rel="noopener noreferrer"
      className="no-drag flex flex-row items-center gap-1 hover:opacity-80 transition-opacity"
    >
      <AIBuddy className="size-5 aibuddy-icon-animation" />
      <span className="text-sm leading-none text-text-secondary -translate-y-px">AIBuddy</span>
    </a>
  );
}
