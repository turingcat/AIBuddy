import { render, screen } from '@testing-library/react';
import { IntlProvider } from 'react-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIntl } from './index';

// Every user-facing string that names the product or its URL scheme is written
// against {appName}/{protocol} rather than hard-coding them. Supplying those
// values centrally is what keeps ~60 call sites from having to pass them.
const PROBE_ID = 'probe';

function Probe({ message }: { message: string }) {
  const intl = useIntl();
  return <span>{intl.formatMessage({ id: PROBE_ID, defaultMessage: message })}</span>;
}

function renderProbe(message: string, edition: string, messages: Record<string, string> = {}) {
  vi.stubEnv('APP_EDITION', edition);
  return render(
    <IntlProvider locale="en" messages={messages}>
      <Probe message={message} />
    </IntlProvider>
  );
}

describe('useIntl brand values', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('supplies heybuddy brand values', () => {
    renderProbe('Welcome to {appName}, use {protocol}://recipe', 'heybuddy');

    expect(screen.getByText('Welcome to HeyBuddy, use goose://recipe')).toBeInTheDocument();
  });

  it('supplies brand values to translated catalog messages too', () => {
    renderProbe('About {appName}', 'heybuddy', { probe: '关于 {appName}' });

    expect(screen.getByText('关于 HeyBuddy')).toBeInTheDocument();
  });

  it('lets a call site override the injected values', () => {
    vi.stubEnv('APP_EDITION', 'heybuddy');
    function Overriding() {
      const intl = useIntl();
      return (
        <span>
          {intl.formatMessage(
            { id: PROBE_ID, defaultMessage: 'Hello {appName}' },
            {
              appName: 'Override',
            }
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
