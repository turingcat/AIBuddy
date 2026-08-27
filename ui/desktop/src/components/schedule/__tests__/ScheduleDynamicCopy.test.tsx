import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router';
import type { ScheduledJobDto } from '@aaif/goose-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import zhCatalog from '../../../i18n/messages/zh-CN.json';
import ScheduleDetailView from '../ScheduleDetailView';
import SchedulesView from '../SchedulesView';

const scheduleMocks = vi.hoisted(() => ({
  list: vi.fn(),
  listSessions: vi.fn(),
  inspect: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../../../acp/schedules', () => ({
  acpListSchedules: scheduleMocks.list,
  acpListScheduleSessions: scheduleMocks.listSessions,
  acpInspectRunningJob: scheduleMocks.inspect,
  acpCreateSchedule: vi.fn(),
  acpDeleteSchedule: vi.fn(),
  acpPauseSchedule: vi.fn(),
  acpUnpauseSchedule: vi.fn(),
  acpUpdateSchedule: vi.fn(),
  acpKillRunningJob: vi.fn(),
  acpRunScheduleNow: vi.fn(),
}));
vi.mock('../../../toasts', () => ({
  toastSuccess: scheduleMocks.toastSuccess,
  toastError: vi.fn(),
}));
vi.mock('../../../utils/analytics', () => ({
  trackScheduleCreated: vi.fn(),
  trackScheduleDeleted: vi.fn(),
  trackScheduleRunNow: vi.fn(),
  getErrorType: vi.fn(),
}));
vi.mock('../../../hooks/useNavigation', () => ({ useNavigation: () => vi.fn() }));
vi.mock('../ScheduleModal', () => ({ ScheduleModal: () => null }));

const zhMessages = Object.fromEntries(
  Object.entries(zhCatalog).map(([id, message]) => [id, message.defaultMessage])
);

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const runningJob = {
  id: 'daily-report',
  cron: '0 9 * * *',
  source: 'daily-report.yaml',
  currentlyRunning: true,
  currentSessionId: 'session-current',
  paused: false,
} as ScheduledJobDto;

function renderChinese(ui: React.ReactElement) {
  return render(
    <IntlProvider locale="zh-CN" messages={zhMessages}>
      <MemoryRouter>{ui}</MemoryRouter>
    </IntlProvider>
  );
}

describe('schedule dynamic copy', () => {
  beforeEach(() => {
    scheduleMocks.list.mockReset().mockResolvedValue([runningJob]);
    scheduleMocks.listSessions.mockReset().mockResolvedValue([]);
    scheduleMocks.inspect.mockReset();
    scheduleMocks.toastSuccess.mockReset();
  });

  it('renders cronstrue output in the current Chinese locale in the schedule list', async () => {
    renderChinese(<SchedulesView />);

    expect(await screen.findByText('在上午 09:00')).toBeInTheDocument();
  });

  it('localizes session, running duration, and unknown copy in list inspection', async () => {
    const user = userEvent.setup();
    scheduleMocks.inspect.mockResolvedValue({ sessionId: 'session-list' });
    renderChinese(<SchedulesView />);

    await user.click(await screen.findByRole('button', { name: '检查' }));

    await waitFor(() => {
      expect(scheduleMocks.toastSuccess).toHaveBeenCalledWith({
        title: '任务检查',
        msg: '会话：session-list\n已运行：未知',
      });
    });
  });

  it('localizes cron and running duration in schedule details', async () => {
    const user = userEvent.setup();
    scheduleMocks.inspect.mockResolvedValue({
      sessionId: 'session-detail',
      runningDurationSeconds: 65,
    });
    renderChinese(<ScheduleDetailView scheduleId="daily-report" onNavigateBack={vi.fn()} />);

    expect(await screen.findByText('在上午 09:00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '检查运行中的任务' }));

    await waitFor(() => {
      expect(scheduleMocks.toastSuccess).toHaveBeenCalledWith({
        title: '任务检查',
        msg: '会话：session-detail\n已运行：1 分 5 秒',
      });
    });
  });
});
