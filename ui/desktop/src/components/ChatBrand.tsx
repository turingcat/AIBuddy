import { getAppEdition } from '../brand';
import aibuddyIcon from '../images/aibuddy/icon.png';
import { Goose } from './icons';

export default function ChatBrand() {
  const isAIBuddy = getAppEdition() === 'aibuddy';

  return (
    <a
      href={isAIBuddy ? 'https://tflow.online' : 'https://github.com/turingcat/HeyBuddy'}
      target="_blank"
      rel="noopener noreferrer"
      className="no-drag flex flex-row items-center gap-1 hover:opacity-80 transition-opacity"
    >
      {isAIBuddy ? (
        <img src={aibuddyIcon} alt="AIBuddy" className="size-5" draggable={false} />
      ) : (
        <Goose className="size-5 goose-icon-animation" />
      )}
      <span className="text-sm leading-none text-text-secondary -translate-y-px">
        {isAIBuddy ? 'AIBuddy' : 'HeyBuddy'}
      </span>
    </a>
  );
}
