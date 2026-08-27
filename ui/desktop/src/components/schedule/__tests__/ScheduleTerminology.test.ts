import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';
import zhCatalog from '../../../i18n/messages/zh-CN.json';
import { scheduleDetailViewMessages } from '../ScheduleDetailView';
import { schedulesViewMessages } from '../SchedulesView';

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

const intl = createIntl({ locale: 'zh-CN', messages: zhMessages });

describe('schedule terminology', () => {
  it('uses scheduled-task terms in production schedule descriptors', () => {
    expect(intl.formatMessage(schedulesViewMessages.scheduler)).toBe('定时任务');
    expect(intl.formatMessage(schedulesViewMessages.createSchedule)).toBe('创建定时任务');
    expect(intl.formatMessage(schedulesViewMessages.description)).toBe(
      '创建和管理定时任务，在指定时间自动运行模板。'
    );
    expect(intl.formatMessage(scheduleDetailViewMessages.scheduleDetails)).toBe('定时任务详情');
  });

  it('does not leave schedule terminology in the Chinese catalog', () => {
    const scheduleMessages = Object.entries(zhCatalog)
      .filter(
        ([id]) =>
          id.startsWith('scheduleDetailView.') ||
          id.startsWith('scheduleModal.') ||
          id.startsWith('schedulesView.')
      )
      .map(([, message]) => message.defaultMessage);

    expect(scheduleMessages.join('\n')).not.toMatch(/计划|配方/);
  });
});
