export interface AuthSessionWindow {
  close(): void;
  isDestroyed(): boolean;
  isVisible(): boolean;
  once(event: 'show', listener: () => void): unknown;
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

      const closeOldWindows = () => {
        for (const window of oldWindows) {
          if (!window.isDestroyed()) {
            window.close();
          }
        }
      };

      if (replacementWindow.isVisible()) {
        closeOldWindows();
      } else {
        await new Promise<void>((resolve) => {
          replacementWindow.once('show', () => {
            closeOldWindows();
            resolve();
          });
        });
      }
    })().finally(() => {
      inFlight = null;
    });

    return inFlight;
  };
}
