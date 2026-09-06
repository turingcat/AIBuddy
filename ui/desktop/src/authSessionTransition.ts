type LoadFailureListener = (
  event: unknown,
  errorCode: number,
  errorDescription: string,
  validatedURL: string,
  isMainFrame: boolean
) => void;

export interface AuthSessionWindow {
  close(): void;
  isDestroyed(): boolean;
  isVisible(): boolean;
  once(event: 'show' | 'closed', listener: () => void): unknown;
  removeListener(event: 'show' | 'closed', listener: () => void): unknown;
  webContents: {
    isDestroyed(): boolean;
    isCrashed(): boolean;
    on(event: 'render-process-gone', listener: () => void): unknown;
    on(event: 'did-fail-load', listener: LoadFailureListener): unknown;
    removeListener(event: 'render-process-gone', listener: () => void): unknown;
    removeListener(event: 'did-fail-load', listener: LoadFailureListener): unknown;
  };
}

interface AuthSessionTransitionDependencies<TWindow extends AuthSessionWindow> {
  listWindows(): TWindow[];
  cleanupBackends(): Promise<void>;
  createReplacementWindow(): Promise<TWindow | undefined>;
}

export function createAuthSessionTransition<TWindow extends AuthSessionWindow>(
  dependencies: AuthSessionTransitionDependencies<TWindow>
): () => Promise<void> {
  let inFlight: Promise<void> | null = null;

  return () => {
    if (inFlight) {
      return inFlight;
    }

    const oldWindows = dependencies.listWindows();
    inFlight = (async () => {
      await dependencies.cleanupBackends();
      const replacementWindow = await dependencies.createReplacementWindow();
      if (!replacementWindow) {
        throw new Error('Failed to create replacement window for authentication transition');
      }
      if (replacementWindow.isDestroyed()) {
        throw new Error('Authentication replacement window was destroyed before showing');
      }
      const { webContents } = replacementWindow;
      if (webContents.isDestroyed() || webContents.isCrashed()) {
        throw new Error('Authentication replacement renderer failed before showing');
      }

      const closeOldWindows = () => {
        for (const window of oldWindows) {
          if (!window.isDestroyed()) {
            window.close();
          }
        }
      };

      if (!replacementWindow.isVisible()) {
        await new Promise<void>((resolve, reject) => {
          const cleanup = () => {
            replacementWindow.removeListener('show', onShow);
            replacementWindow.removeListener('closed', onFailure);
            webContents.removeListener('render-process-gone', onFailure);
            webContents.removeListener('did-fail-load', onLoadFailure);
          };
          const onShow = () => {
            cleanup();
            resolve();
          };
          const onFailure = () => {
            cleanup();
            reject(new Error('Authentication replacement window failed before showing'));
          };
          const onLoadFailure: LoadFailureListener = (
            _event,
            _errorCode,
            _errorDescription,
            _validatedURL,
            isMainFrame
          ) => {
            if (isMainFrame) onFailure();
          };
          replacementWindow.once('show', onShow);
          replacementWindow.once('closed', onFailure);
          webContents.on('render-process-gone', onFailure);
          webContents.on('did-fail-load', onLoadFailure);
        });
      }
      closeOldWindows();
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
