const fs = require('node:fs');
const path = require('node:path');

function readAuthContract(scriptPath) {
  const script = fs.readFileSync(scriptPath, 'utf8');
  const defaultMatch = script.match(/\[string\]\$AuthApiBaseUrl\s*=\s*'([^']+)'/);
  const environmentMatch = script.match(/\$env:([A-Z_]+)\s*=\s*\$AuthApiBaseUrl/);

  return {
    defaultAuthApiBaseUrl: defaultMatch?.[1],
    emittedEnvironmentVariable: environmentMatch?.[1],
  };
}

describe('Windows auth script contract', () => {
  const repositoryRoot = path.resolve(__dirname, '../../..');

  it.each(['build-windows.ps1', 'dev-ui.ps1'])(
    '%s defaults to TFlow and forwards the AIBuddy auth override',
    (scriptName) => {
      expect(readAuthContract(path.join(repositoryRoot, scriptName))).toEqual({
        defaultAuthApiBaseUrl: 'https://tflow.online',
        emittedEnvironmentVariable: 'AIBUDDY_AUTH_API_BASE_URL',
      });
    }
  );
});
