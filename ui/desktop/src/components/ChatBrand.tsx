import { Goose } from './icons';

export default function ChatBrand() {
  return (
    <a
      href="https://github.com/turingcat/HeyBuddy"
      target="_blank"
      rel="noopener noreferrer"
      className="no-drag flex flex-row items-center gap-1 hover:opacity-80 transition-opacity"
    >
      <Goose className="size-5 goose-icon-animation" />
      <span className="text-sm leading-none text-text-secondary -translate-y-px">HeyBuddy</span>
    </a>
  );
}
