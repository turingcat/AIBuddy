import type { AIBuddyGroup, Sub2apiPublicSettings } from './sub2apiAuth';

export interface PendingAIBuddyLogin {
  accessToken: string;
  settings: Sub2apiPublicSettings;
  groups: AIBuddyGroup[];
}

interface StoredPendingAIBuddyLogin extends PendingAIBuddyLogin {
  createdAt: number;
}

export class AIBuddyPendingLoginStore {
  private readonly pending = new Map<string, StoredPendingAIBuddyLogin>();

  constructor(
    private readonly idFactory: () => string = () => globalThis.crypto.randomUUID(),
    private readonly ttlMs = 10 * 60 * 1_000
  ) {}

  create(login: PendingAIBuddyLogin): string {
    this.clearExpired();
    const id = this.idFactory();
    this.pending.set(id, { ...login, createdAt: Date.now() });
    return id;
  }

  consume(id: string): PendingAIBuddyLogin | null {
    const login = this.pending.get(id);
    this.pending.delete(id);
    if (!login || Date.now() - login.createdAt > this.ttlMs) {
      return null;
    }
    return { accessToken: login.accessToken, settings: login.settings, groups: login.groups };
  }

  private clearExpired(): void {
    for (const [id, login] of this.pending) {
      if (Date.now() - login.createdAt > this.ttlMs) {
        this.pending.delete(id);
      }
    }
  }
}
