import type { InitializeResponse } from '@agentclientprotocol/sdk';
import { describe, expect, it } from 'vitest';
import { hasLocalInferenceCapability, hasRecipeParameterScopesCapability } from '../capabilities';

function initializeResponseWithMeta(meta?: unknown): Pick<InitializeResponse, 'agentCapabilities'> {
  return {
    agentCapabilities: {
      _meta: meta,
    },
  } as Pick<InitializeResponse, 'agentCapabilities'>;
}

describe('ACP capabilities', () => {
  it('detects local inference support from HeyBuddy metadata', () => {
    expect(
      hasLocalInferenceCapability(
        initializeResponseWithMeta({
          heybuddy: {
            localInference: {},
          },
        })
      )
    ).toBe(true);
  });

  it('detects scoped recipe-parameter support from HeyBuddy metadata', () => {
    expect(
      hasRecipeParameterScopesCapability(
        initializeResponseWithMeta({
          heybuddy: {
            recipeParameterScopes: {},
          },
        })
      )
    ).toBe(true);
  });

  it('treats missing or malformed scoped recipe-parameter metadata as unsupported', () => {
    expect(hasRecipeParameterScopesCapability(initializeResponseWithMeta())).toBe(false);
    expect(hasRecipeParameterScopesCapability(initializeResponseWithMeta({}))).toBe(false);
    expect(hasRecipeParameterScopesCapability(initializeResponseWithMeta({ heybuddy: {} }))).toBe(
      false
    );
    expect(hasRecipeParameterScopesCapability(initializeResponseWithMeta({ heybuddy: true }))).toBe(
      false
    );
  });

  it('treats missing local inference metadata as unsupported', () => {
    expect(hasLocalInferenceCapability(initializeResponseWithMeta())).toBe(false);
    expect(hasLocalInferenceCapability(initializeResponseWithMeta({}))).toBe(false);
    expect(hasLocalInferenceCapability(initializeResponseWithMeta({ heybuddy: {} }))).toBe(false);
  });

  it('ignores malformed HeyBuddy metadata', () => {
    expect(hasLocalInferenceCapability(initializeResponseWithMeta({ heybuddy: true }))).toBe(false);
    expect(hasLocalInferenceCapability(initializeResponseWithMeta({ heybuddy: null }))).toBe(false);
  });
});
