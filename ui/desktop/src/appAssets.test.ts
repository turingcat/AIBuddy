import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { packagedAibuddyAssetPath } from './appAssets';

describe('packaged AIBuddy asset paths', () => {
  it('maps nested source stems into the narrowed AIBuddy resource directory', () => {
    expect(
      packagedAibuddyAssetPath(
        '/Applications/AIBuddy.app/Contents/Resources',
        'aibuddy/icon',
        'icns'
      )
    ).toBe(path.join('/Applications/AIBuddy.app/Contents/Resources', 'aibuddy', 'icon.icns'));
    expect(
      packagedAibuddyAssetPath(
        '/Applications/AIBuddy.app/Contents/Resources',
        'aibuddy/iconTemplate',
        'png'
      )
    ).toBe(
      path.join('/Applications/AIBuddy.app/Contents/Resources', 'aibuddy', 'iconTemplate.png')
    );
  });
});
