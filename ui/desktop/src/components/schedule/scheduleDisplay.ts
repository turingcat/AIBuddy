import cronstrue from 'cronstrue';
import 'cronstrue/locales/zh_CN';
import type { IntlShape } from 'react-intl';
import { defineMessages } from '../../i18n';

const i18n = defineMessages({
  session: {
    id: 'scheduleDisplay.session',
    defaultMessage: 'Session: {sessionId}',
  },
  runningFor: {
    id: 'scheduleDisplay.runningFor',
    defaultMessage: 'Running for: {duration}',
  },
  duration: {
    id: 'scheduleDisplay.duration',
    defaultMessage: '{minutes}m {seconds}s',
  },
  unknown: {
    id: 'scheduleDisplay.unknown',
    defaultMessage: 'Unknown',
  },
});

function cronstrueLocale(locale: string): string {
  return locale.toLowerCase().startsWith('zh') ? 'zh_CN' : 'en';
}

export function formatCronDescription(cron: string, locale: string): string {
  try {
    return cronstrue.toString(cron, { locale: cronstrueLocale(locale) });
  } catch {
    return cron;
  }
}

export function formatJobInspection(
  intl: IntlShape,
  result: { sessionId: string; runningDurationSeconds?: number | null }
): string {
  const duration =
    typeof result.runningDurationSeconds === 'number'
      ? intl.formatMessage(i18n.duration, {
          minutes: Math.floor(result.runningDurationSeconds / 60),
          seconds: result.runningDurationSeconds % 60,
        })
      : intl.formatMessage(i18n.unknown);

  return [
    intl.formatMessage(i18n.session, { sessionId: result.sessionId }),
    intl.formatMessage(i18n.runningFor, { duration }),
  ].join('\n');
}
