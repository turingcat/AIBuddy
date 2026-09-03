import React from 'react';
import { AlertTriangle } from 'lucide-react';
import type { Message, SystemNotificationContent } from '../../types/message';
import { AppEvents } from '../../constants/events';
import { defineMessages, useIntl } from '../../i18n';

const i18n = defineMessages({
  insufficientCredits: {
    id: 'creditsExhaustedNotification.insufficientCredits',
    defaultMessage: 'Insufficient Credits',
  },
  addCredits: {
    id: 'creditsExhaustedNotification.addCredits',
    defaultMessage: 'Add credits',
  },
});

interface CreditsExhaustedNotificationProps {
  notification: SystemNotificationContent;
}

export const CreditsExhaustedNotification: React.FC<CreditsExhaustedNotificationProps> = ({
  notification,
}) => {
  const intl = useIntl();

  // 充值走应用内微信弹窗，站点未开通时弹窗内再回退网页充值
  const handleTopUp = () => {
    window.dispatchEvent(new CustomEvent(AppEvents.OPEN_RECHARGE_DIALOG));
  };

  return (
    <div className="rounded-lg border border-yellow-600/30 dark:border-yellow-500/30 bg-yellow-500/10 dark:bg-yellow-500/10 p-4 my-2">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="text-sm font-semibold text-yellow-800 dark:text-yellow-200">
            {intl.formatMessage(i18n.insufficientCredits)}
          </div>
          <div className="text-sm text-yellow-800/80 dark:text-yellow-200/80 mt-1">
            {notification.msg}
          </div>
          <button
            onClick={handleTopUp}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-yellow-600 hover:bg-yellow-500 dark:bg-yellow-700 dark:hover:bg-yellow-600 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {intl.formatMessage(i18n.addCredits)}
          </button>
        </div>
      </div>
    </div>
  );
};

export function getCreditsExhaustedNotification(
  message: Message
): SystemNotificationContent | undefined {
  return message.content.find(
    (content): content is SystemNotificationContent & { type: 'systemNotification' } =>
      content.type === 'systemNotification' && content.notificationType === 'creditsExhausted'
  );
}
