import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createAuthSessionTransition } from './authSessionTransition';

class FakeWindow extends EventEmitter {
  readonly webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => this.destroyed,
    isCrashed: vi.fn(() => false),
  });
  private destroyed = false;
  private visible = false;
  readonly close = vi.fn(() => {
    this.destroyed = true;
    this.emit('closed');
  });

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isVisible(): boolean {
    return this.visible;
  }

  show(): void {
    this.visible = true;
    this.emit('show');
  }
}

describe('createAuthSessionTransition', () => {
  it('keeps old windows open until the replacement window is shown', async () => {
    const oldWindow = new FakeWindow();
    const replacementWindow = new FakeWindow();
    const cleanupBackends = vi.fn(async () => undefined);
    const createReplacementWindow = vi.fn(async () => replacementWindow);
    const transition = createAuthSessionTransition({
      listWindows: () => [oldWindow],
      cleanupBackends,
      createReplacementWindow,
    });

    let completed = false;
    const transitionPromise = transition().then(() => {
      completed = true;
    });

    await vi.waitFor(() => expect(createReplacementWindow).toHaveBeenCalledOnce());

    expect(cleanupBackends).toHaveBeenCalledOnce();
    expect(oldWindow.close).not.toHaveBeenCalled();
    expect(completed).toBe(false);

    replacementWindow.show();
    await transitionPromise;

    expect(oldWindow.close).toHaveBeenCalledOnce();
    expect(completed).toBe(true);
    expect(replacementWindow.eventNames()).toEqual([]);
    expect(replacementWindow.webContents.eventNames()).toEqual([]);
  });

  it('closes old windows immediately when the replacement is already visible', async () => {
    const oldWindow = new FakeWindow();
    const replacementWindow = new FakeWindow();
    replacementWindow.show();
    const transition = createAuthSessionTransition({
      listWindows: () => [oldWindow],
      cleanupBackends: async () => undefined,
      createReplacementWindow: async () => replacementWindow,
    });

    await transition();

    expect(oldWindow.close).toHaveBeenCalledOnce();
  });

  it('coalesces concurrent authentication transitions', async () => {
    const oldWindow = new FakeWindow();
    const replacementWindow = new FakeWindow();
    let finishCleanup!: () => void;
    const cleanupBackends = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        })
    );
    const createReplacementWindow = vi.fn(async () => replacementWindow);
    const transition = createAuthSessionTransition({
      listWindows: () => [oldWindow],
      cleanupBackends,
      createReplacementWindow,
    });

    const first = transition();
    const second = transition();
    finishCleanup();
    await vi.waitFor(() => expect(createReplacementWindow).toHaveBeenCalledOnce());
    replacementWindow.show();
    await Promise.all([first, second]);

    expect(cleanupBackends).toHaveBeenCalledOnce();
    expect(createReplacementWindow).toHaveBeenCalledOnce();
  });

  it('leaves old windows open when no replacement window is created', async () => {
    const oldWindow = new FakeWindow();
    const transition = createAuthSessionTransition({
      listWindows: () => [oldWindow],
      cleanupBackends: async () => undefined,
      createReplacementWindow: async () => undefined,
    });

    await expect(transition()).rejects.toThrow('replacement window');
    expect(oldWindow.close).not.toHaveBeenCalled();
  });

  it.each([
    'already destroyed',
    'already crashed',
    'closed',
    'render-process-gone',
    'did-fail-load',
  ])('rejects a replacement that is %s, cleans listeners and allows retry', async (failure) => {
    const oldWindow = new FakeWindow();
    const replacementWindow = new FakeWindow();
    const retryWindow = new FakeWindow();
    retryWindow.show();
    if (failure === 'already destroyed') replacementWindow.close();
    if (failure === 'already crashed')
      replacementWindow.webContents.isCrashed.mockReturnValue(true);
    const createReplacementWindow = vi
      .fn()
      .mockResolvedValueOnce(replacementWindow)
      .mockResolvedValueOnce(retryWindow);
    const transition = createAuthSessionTransition({
      listWindows: () => [oldWindow],
      cleanupBackends: async () => undefined,
      createReplacementWindow,
    });
    let outcome: unknown;
    const pending = transition().then(
      () => {
        outcome = 'resolved';
      },
      (error) => {
        outcome = error;
      }
    );
    await vi.waitFor(() => expect(createReplacementWindow).toHaveBeenCalledOnce());
    if (failure === 'closed') replacementWindow.close();
    if (failure === 'render-process-gone') {
      replacementWindow.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
    }
    if (failure === 'did-fail-load') {
      replacementWindow.webContents.emit(
        'did-fail-load',
        {},
        -105,
        'NAME_NOT_RESOLVED',
        'app://login',
        true
      );
    }
    await vi.waitFor(() => expect(outcome).toBeInstanceOf(Error));
    await pending;
    expect(oldWindow.close).not.toHaveBeenCalled();
    expect(replacementWindow.eventNames()).toEqual([]);
    expect(replacementWindow.webContents.eventNames()).toEqual([]);
    replacementWindow.show();
    expect(oldWindow.close).not.toHaveBeenCalled();

    await transition();
    expect(createReplacementWindow).toHaveBeenCalledTimes(2);
    expect(oldWindow.close).toHaveBeenCalledOnce();
  });

  it('ignores subframe load failures and preserves unrelated listeners', async () => {
    const oldWindow = new FakeWindow();
    const replacementWindow = new FakeWindow();
    const existingListener = vi.fn();
    replacementWindow.webContents.on('did-fail-load', existingListener);
    const transition = createAuthSessionTransition({
      listWindows: () => [oldWindow],
      cleanupBackends: async () => undefined,
      createReplacementWindow: async () => replacementWindow,
    });
    const pending = transition();
    await vi.waitFor(() => expect(replacementWindow.listenerCount('show')).toBe(1));
    replacementWindow.webContents.emit(
      'did-fail-load',
      {},
      -105,
      'NAME_NOT_RESOLVED',
      'app://frame',
      false
    );
    expect(oldWindow.close).not.toHaveBeenCalled();
    replacementWindow.show();
    await pending;
    expect(oldWindow.close).toHaveBeenCalledOnce();
    expect(replacementWindow.eventNames()).toEqual([]);
    expect(replacementWindow.webContents.listeners('did-fail-load')).toEqual([existingListener]);
    expect(replacementWindow.webContents.listenerCount('render-process-gone')).toBe(0);
  });
});
