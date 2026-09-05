import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createAuthSessionTransition } from './authSessionTransition';

class FakeWindow extends EventEmitter {
  private destroyed = false;
  private visible = false;
  readonly close = vi.fn(() => {
    this.destroyed = true;
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
});
