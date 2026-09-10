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

test('maps embedded CamelCase brand segments without rewriting ordinary words', () => {
  assert.equal(renameBrandSegments('startGooseServe'), 'startAIBuddyServe');
  assert.equal(renameBrandSegments('buildGooseServeEnv'), 'buildAIBuddyServeEnv');
  assert.equal(renameBrandSegments('isRetiredHeyBuddyChatApp'), 'isRetiredAIBuddyChatApp');
  assert.equal(renameBrandSegments('HeyBuddyhintsModal'), 'AIBuddyhintsModal');
  assert.equal(renameBrandSegments('readHeyBuddyhints'), 'readAIBuddyhints');
  assert.equal(renameBrandSegments('externalHeyBuddyd'), 'externalAIBuddyd');
  assert.equal(renameBrandSegments('.heybuddyhints'), '.aibuddyhints');
  assert.equal(renameBrandSegments('heybuddyhintsModal'), 'aibuddyhintsModal');
  assert.equal(renameBrandSegments('mongoose'), 'mongoose');
  assert.equal(renameBrandSegments('gooseberry'), 'gooseberry');
});

test('maps shell variables, product derivatives, and packaging compounds', () => {
  assert.equal(renameBrandSegments('$HEYBUDDY_VERSION'), '$AIBUDDY_VERSION');
  assert.equal(renameBrandSegments('heybuddyd'), 'aibuddyd');
  assert.equal(renameBrandSegments('HeyBuddyy'), 'AIBuddyy');
  assert.equal(renameBrandSegments('heybuddyhints'), 'aibuddyhints');
  assert.equal(renameBrandSegments('libheybuddy_sdk'), 'libaibuddy_sdk');
  assert.equal(renameBrandSegments('20heybuddy'), '20aibuddy');
  assert.equal(renameBrandSegments('bHEYBUDDY_'), 'bAIBUDDY_');
});

test('repairs known upstream substitutions that changed third-party words', () => {
  assert.equal(renameBrandSegments('monheybuddy'), 'mongoose');
  assert.equal(renameBrandSegments('Monheybuddy'), 'Mongoose');
  assert.equal(renameBrandSegments('heybuddybumps'), 'goosebumps');
});

test('maps encoded URL segments and product suffixes at text boundaries', () => {
  assert.equal(renameBrandSegments('https%3A%2F%2Fexample%2Fheybuddy%2F'), 'https%3A%2F%2Fexample%2Faibuddy%2F');
  assert.equal(renameBrandSegments('heybuddyselftest/'), 'aibuddyselftest/');
  assert.equal(renameBrandSegments('heybuddyd backend'), 'aibuddyd backend');
});
