import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { describe, expect, it } from 'vitest';
import { useIntl } from './index';

const PROBE_ID = 'probe';

function Probe({ message }: { message: string }) {
  const intl = useIntl();
  return <span>{intl.formatMessage({ id: PROBE_ID, defaultMessage: message })}</span>;
}

function renderProbe(message: string, messages: Record<string, string> = {}) {
  return render(
    <IntlProvider locale="en" messages={messages}>
      <Probe message={message} />
    </IntlProvider>
  );
}

describe('useIntl brand values', () => {
  it('supplies fixed AIBuddy brand values', () => {
    renderProbe('Welcome to {appName}, use {protocol}://recipe');

    expect(screen.getByText('Welcome to AIBuddy, use aibuddy://recipe')).toBeInTheDocument();
  });

  it('supplies brand values to translated catalog messages too', () => {
    renderProbe('About {appName}', { probe: '关于 {appName}' });

    expect(screen.getByText('关于 AIBuddy')).toBeInTheDocument();
  });

  it('lets a call site override the injected values', () => {
    function Overriding() {
      const intl = useIntl();
      return (
        <span>
          {intl.formatMessage(
            { id: PROBE_ID, defaultMessage: 'Hello {appName}' },
            { appName: 'Override' }
          )}
        </span>
      );
    }

    render(
      <IntlProvider locale="en" messages={{}}>
        <Overriding />
      </IntlProvider>
    );

    expect(screen.getByText('Hello Override')).toBeInTheDocument();
  });
});
