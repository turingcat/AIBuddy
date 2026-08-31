import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import * as path from 'path';
import log from './logger';
import { loadRecentDirs } from './recentDirs';
import { getAppDisplayName, getAppIconStem } from '../brand';

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
  const imagesDir = app.isPackaged
    ? path.join(process.resourcesPath, 'images')
    : path.join(process.cwd(), 'src', 'images');

  // 新品牌托盘图标为彩色 logo，不再标记为 template image：
  // macOS 的 template 渲染会把彩色位图强制压成单色剪影
  // @author logic
  // @date 2026-08-14
  const image = nativeImage.createFromPath(path.join(imagesDir, `${getAppIconStem()}.png`));
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray.setImage(image);
  tray.setToolTip(getAppDisplayName());
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Window', click: showAllWindows },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
}
