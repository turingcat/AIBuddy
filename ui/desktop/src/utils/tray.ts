import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import * as path from 'path';
import log from './logger';
import { loadRecentDirs } from './recentDirs';
import { getAppDisplayName, getAppTrayIconStem } from '../brand';
import { packagedAibuddyAssetPath } from '../appAssets';

function showAllWindows() {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    log.info('No windows are open, creating a new one...');
    const recentDirs = loadRecentDirs();
    const openDir = recentDirs.length > 0 ? recentDirs[0] : null;
    ipcMain.emit('create-chat-window', {}, undefined, openDir);
    return;
  }

  // Cascade the windows so a stack of them is distinguishable once restored
  const offset = 30;
  windows.forEach((win, index) => {
    const bounds = win.getBounds();
    win.setBounds({
      x: bounds.x + offset * index,
      y: bounds.y + offset * index,
      width: bounds.width,
      height: bounds.height,
    });

    if (!win.isVisible()) {
      win.show();
    }

    win.focus();
  });
}

export function setTrayRef(tray: Tray) {
  const trayIconPath = app.isPackaged
    ? packagedAibuddyAssetPath(process.resourcesPath, getAppTrayIconStem(), 'png')
    : path.join(process.cwd(), 'src', 'images', `${getAppTrayIconStem()}.png`);

  // 托盘取 22/44px 的 *Template 单色字形，不能用 1024px 的彩色应用图标：
  // macOS 会把满幅彩色位图压成实心剪影，菜单栏上只剩一个白色方块
  // @author logic
  // @date 2026-08-14
  tray.setImage(nativeImage.createFromPath(trayIconPath));
  tray.setToolTip(getAppDisplayName());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Window', click: showAllWindows },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}
