import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSession } from '../sessions';
import type { ExtensionConfig } from '../types/extensions';
import type { Session } from '../types/session';
import type { FixedExtensionEntry } from '../components/ConfigContext';
import type { HeyBuddyExtension, HeyBuddyExtensionEntry } from '@heybuddy/heybuddy-sdk';
import { getConfiguredHeyBuddyExtensions } from '../acp/extensions';
import { acpChatSessionController } from '../acp/chatSessionController';
import { beginConfiguredRecipeParameterScope } from '../acp/recipeParamRequests';
import { getAcpFeatureCapabilities } from '../acp/capabilities';

vi.mock('../acp/extensions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../acp/extensions')>();
  return {
    ...actual,
    getConfiguredHeyBuddyExtensions: vi.fn(),
  };
});

vi.mock('../acp/chatSessionController', () => ({
  acpChatSessionController: {
    createSession: vi.fn(),
  },
}));

vi.mock('../acp/recipeParamRequests', () => ({
  beginConfiguredRecipeParameterScope: vi.fn(),
}));

vi.mock('../acp/capabilities', () => ({
  getAcpFeatureCapabilities: vi.fn(),
}));

const testSession: Session = {
  id: 'session-1',
  name: 'untitled',
  message_count: 0,
  created_at: '2026-06-19T00:00:00.000Z',
  updated_at: '2026-06-19T00:00:00.000Z',
  working_dir: '/tmp',
  extension_data: { active: [], installed: [] },
};

const extensionConfig = (name: string): ExtensionConfig => ({
  name,
  type: 'builtin',
  description: `${name} extension`,
});

const configuredExtension = (name: string, enabled: boolean): FixedExtensionEntry => ({
  ...extensionConfig(name),
  enabled,
});

const heybuddyExtension = (name: string): HeyBuddyExtension => ({
  type: 'builtin',
  name,
  description: `${name} extension`,
});

const heybuddyExtensionEntry = (name: string): HeyBuddyExtensionEntry => ({
  extension: heybuddyExtension(name),
  enabled: true,
});

const mockedGetConfiguredHeyBuddyExtensions = vi.mocked(getConfiguredHeyBuddyExtensions);
const mockedCreateAcpSession = vi.mocked(acpChatSessionController.createSession);
const mockedBeginConfiguredRecipeParameterScope = vi.mocked(beginConfiguredRecipeParameterScope);
const mockedGetAcpFeatureCapabilities = vi.mocked(getAcpFeatureCapabilities);
const finishConfiguredRecipeParameterScope = vi.fn();

describe('createSession ACP session extensions', () => {
  beforeEach(() => {
    mockedGetConfiguredHeyBuddyExtensions.mockReset();
    mockedGetConfiguredHeyBuddyExtensions.mockResolvedValue([
      heybuddyExtensionEntry('developer'),
      heybuddyExtensionEntry('memory'),
    ]);
    mockedCreateAcpSession.mockReset();
    mockedCreateAcpSession.mockResolvedValue(testSession);
    finishConfiguredRecipeParameterScope.mockReset();
    mockedBeginConfiguredRecipeParameterScope.mockReset();
    mockedBeginConfiguredRecipeParameterScope.mockReturnValue({
      id: 'scope-1',
      finish: finishConfiguredRecipeParameterScope,
    });
    mockedGetAcpFeatureCapabilities.mockReset();
    mockedGetAcpFeatureCapabilities.mockResolvedValue({
      localInference: false,
      recipeParameterScopes: true,
    });
  });

  it('sends non-empty extension configs as ACP session extensions', async () => {
    await createSession('/tmp', {
      extensionConfigs: [extensionConfig('developer')],
    });

    expect(mockedGetConfiguredHeyBuddyExtensions).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', [heybuddyExtension('developer')], {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('falls back to enabled configured extensions when extension configs are empty', async () => {
    await createSession('/tmp', {
      extensionConfigs: [],
      allExtensions: [configuredExtension('developer', true), configuredExtension('memory', false)],
    });

    expect(mockedGetConfiguredHeyBuddyExtensions).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', [heybuddyExtension('developer')], {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('omits ACP session extensions when no configured extensions are enabled', async () => {
    await createSession('/tmp', {
      allExtensions: [configuredExtension('developer', false)],
    });

    expect(mockedGetConfiguredHeyBuddyExtensions).not.toHaveBeenCalled();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', [], {
      recipeDeeplink: undefined,
      recipeId: undefined,
      recipeParameterScopeId: undefined,
    });
  });

  it('scopes startup parameters to recipe deeplink session creation', async () => {
    await createSession('/tmp', { recipeDeeplink: 'heybuddy://recipe?url=example' });

    expect(mockedBeginConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).toHaveBeenCalledWith('/tmp', [], {
      recipeDeeplink: 'heybuddy://recipe?url=example',
      recipeId: undefined,
      recipeParameterScopeId: 'scope-1',
    });
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('finishes the deeplink parameter scope when session creation fails', async () => {
    mockedCreateAcpSession.mockRejectedValueOnce(new Error('session creation failed'));

    await expect(
      createSession('/tmp', { recipeDeeplink: 'heybuddy://recipe?url=example' })
    ).rejects.toThrow('session creation failed');

    expect(mockedBeginConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('finishes the deeplink parameter scope when extension lookup fails', async () => {
    mockedGetConfiguredHeyBuddyExtensions.mockRejectedValueOnce(new Error('extension lookup failed'));

    await expect(
      createSession('/tmp', {
        recipeDeeplink: 'heybuddy://recipe?url=example',
        extensionConfigs: [extensionConfig('developer')],
      })
    ).rejects.toThrow('extension lookup failed');

    expect(mockedBeginConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
    expect(mockedCreateAcpSession).not.toHaveBeenCalled();
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('reports incompatible HeyBuddy servers before sending scoped parameters', async () => {
    mockedGetAcpFeatureCapabilities.mockResolvedValueOnce({
      localInference: false,
      recipeParameterScopes: false,
    });

    await expect(
      createSession('/tmp', { recipeDeeplink: 'heybuddy://recipe?url=example' })
    ).rejects.toThrow(
      'The connected HeyBuddy server does not support securely scoped deeplink recipe parameters. Update the server and try again.'
    );

    expect(mockedCreateAcpSession).not.toHaveBeenCalled();
    expect(finishConfiguredRecipeParameterScope).toHaveBeenCalledOnce();
  });

  it('does not activate startup parameters for ordinary or recipe-id sessions', async () => {
    await createSession('/tmp');
    await createSession('/tmp', { recipeId: 'recipe-1' });

    expect(mockedBeginConfiguredRecipeParameterScope).not.toHaveBeenCalled();
  });
});
