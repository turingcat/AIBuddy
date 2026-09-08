import assert from 'node:assert/strict';
import test from 'node:test';

import { BRAND_MAP, mappedBrand } from '../src/brand-map.mjs';
import { renameBrandSegments } from '../src/adapters/shared.mjs';

test('maps Goose and HeyBuddy singular and plural forms to AIBuddy', () => {
  const expected = new Map([
    ['GOOSE', 'AIBUDDY'],
    ['Goose', 'AIBuddy'],
    ['goose', 'aibuddy'],
    ['GEESE', 'AIBUDDIES'],
    ['Geese', 'AIBuddies'],
    ['geese', 'aibuddies'],
    ['HEYBUDDY', 'AIBUDDY'],
    ['HeyBuddy', 'AIBuddy'],
    ['heybuddy', 'aibuddy'],
    ['HEYBUDDIES', 'AIBUDDIES'],
    ['HeyBuddies', 'AIBuddies'],
    ['heybuddies', 'aibuddies'],
  ]);
  for (const [source, target] of expected) assert.equal(mappedBrand(source), target);
});

test('maps mixed identifiers, paths, package scopes, and owned repository names', () => {
  assert.equal(
    renameBrandSegments('Goose HeyBuddy goose_cli heybuddy-sdk Geese HeyBuddies'),
    'AIBuddy AIBuddy aibuddy_cli aibuddy-sdk AIBuddies AIBuddies',
  );
  assert.equal(renameBrandSegments('crates/heybuddy-cli/src/goose.rs'), 'crates/aibuddy-cli/src/aibuddy.rs');
  assert.equal(renameBrandSegments('@aaif/heybuddy-sdk'), '@aibuddy/aibuddy-sdk');
  assert.equal(renameBrandSegments('github.com/turingcat/HeyBuddy'), 'github.com/turingcat/AIBuddy');
});

test('mapping policy exposes reusable sync metadata', () => {
  assert.equal(BRAND_MAP.mirrorBranch, 'upstream/aibuddy-mirror');
  assert.deepEqual(BRAND_MAP.allowedApplyBranchPrefixes, ['feat/', 'sync/']);
  assert.equal(BRAND_MAP.provenanceFile, '.aibuddy-rebrand.json');
});
