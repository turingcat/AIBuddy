const { checkNodeVersion } = require('./check-node-version');

// Node 26 makes electron-forge exit 0 in the middle of unpacking Electron and
// leaves no package behind, so an unsupported runtime has to stop the build
// before it destroys the previous artifact.
describe('checkNodeVersion', () => {
  it('accepts a version inside the engines range', () => {
    expect(() => checkNodeVersion('v24.10.0', '^24.10.0')).not.toThrow();
    expect(() => checkNodeVersion('v24.12.3', '^24.10.0')).not.toThrow();
  });

  it.each(['v26.5.0', 'v22.14.0', 'v24.9.0'])('rejects %s', (version) => {
    expect(() => checkNodeVersion(version, '^24.10.0')).toThrow(/\^24\.10\.0/);
    expect(() => checkNodeVersion(version, '^24.10.0')).toThrow(version);
  });

  it('reads the range from package.json when not given one', () => {
    expect(() => checkNodeVersion('v26.5.0')).toThrow(/\^24\.10\.0/);
  });

  it('rejects an unparseable version rather than passing it through', () => {
    expect(() => checkNodeVersion('not-a-version', '^24.10.0')).toThrow();
  });
});
