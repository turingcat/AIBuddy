import aibuddyIcon from '../images/aibuddy/icon.png';

export default function ChatBrand() {
  return (
    <a
      href="https://tflow.online"
      target="_blank"
      rel="noopener noreferrer"
      className="no-drag flex flex-row items-center gap-1 hover:opacity-80 transition-opacity"
    >
      <img src={aibuddyIcon} alt="AIBuddy" className="size-5" draggable={false} />
      <span className="text-sm leading-none text-text-secondary -translate-y-px">
        AIBuddy
      </span>
    </a>
  );
}
