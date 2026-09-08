import { defineMessages, type IntlShape } from 'react-intl';

const i18n = defineMessages({
  confirmation: {
    id: 'accountMenu.logoutConfirmation',
    defaultMessage: 'Are you sure you want to log out?',
  },
});

export async function logout(intl: IntlShape) {
  if (!window.confirm(intl.formatMessage(i18n.confirmation))) return;
  await window.electron.clearLoginCredentials();
  await window.electron.refreshAuthSession();
}
