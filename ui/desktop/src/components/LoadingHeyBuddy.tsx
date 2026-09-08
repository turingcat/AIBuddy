import HeyBuddyLogo from './HeyBuddyLogo';
import AnimatedIcons from './AnimatedIcons';
import FlyingBird from './FlyingBird';
import { ChatState } from '../types/chatState';
import { defineMessages, useIntl } from '../i18n';

interface LoadingHeyBuddyProps {
  message?: string;
  chatState?: ChatState;
}

const i18n = defineMessages({
  loadingConversation: {
    id: 'loadingHeyBuddy.loadingConversation',
    defaultMessage: 'loading conversation...',
  },
  thinking: {
    id: 'loadingHeyBuddy.thinking',
    defaultMessage: '{appName} is thinking…',
  },
  streaming: {
    id: 'loadingHeyBuddy.streaming',
    defaultMessage: '{appName} is working on it…',
  },
  waiting: {
    id: 'loadingHeyBuddy.waiting',
    defaultMessage: '{appName} is waiting…',
  },
  compacting: {
    id: 'loadingHeyBuddy.compacting',
    defaultMessage: '{appName} is compacting the conversation...',
  },
  idle: {
    id: 'loadingHeyBuddy.idle',
    defaultMessage: '{appName} is working on it…',
  },
  restartingAgent: {
    id: 'loadingHeyBuddy.restartingAgent',
    defaultMessage: 'restarting session...',
  },
});

const STATE_ICONS: Record<ChatState, React.ReactNode> = {
  [ChatState.LoadingConversation]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Thinking]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Streaming]: <FlyingBird className="flex-shrink-0" cycleInterval={150} />,
  [ChatState.WaitingForUserInput]: (
    <AnimatedIcons className="flex-shrink-0" cycleInterval={600} variant="waiting" />
  ),
  [ChatState.Compacting]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
  [ChatState.Idle]: <HeyBuddyLogo size="small" />,
  [ChatState.RestartingAgent]: <AnimatedIcons className="flex-shrink-0" cycleInterval={600} />,
};

const STATE_MESSAGE_KEYS: Record<ChatState, keyof typeof i18n> = {
  [ChatState.LoadingConversation]: 'loadingConversation',
  [ChatState.Thinking]: 'thinking',
  [ChatState.Streaming]: 'streaming',
  [ChatState.WaitingForUserInput]: 'waiting',
  [ChatState.Compacting]: 'compacting',
  [ChatState.Idle]: 'idle',
  [ChatState.RestartingAgent]: 'restartingAgent',
};

const LoadingHeyBuddy = ({ message, chatState = ChatState.Idle }: LoadingHeyBuddyProps) => {
  const intl = useIntl();
  const displayMessage = message || intl.formatMessage(i18n[STATE_MESSAGE_KEYS[chatState]]);
  const icon = STATE_ICONS[chatState];

  return (
    <div className="w-full animate-fade-slide-up">
      <div
        data-testid="loading-indicator"
        className="flex items-center gap-2 text-xs text-text-primary py-2"
      >
        {icon}
        {displayMessage}
      </div>
    </div>
  );
};

export default LoadingHeyBuddy;
