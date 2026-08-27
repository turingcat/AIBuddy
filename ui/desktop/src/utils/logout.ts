export async function logout() {
  if (!window.confirm('确定退出登录吗？')) return;
  await window.electron.clearLoginCredentials();
  window.electron.restartApp();
}
