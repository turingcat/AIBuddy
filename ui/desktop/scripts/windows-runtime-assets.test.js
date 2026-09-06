const fs = require('fs');
const path = require('path');

describe('Windows Node.js runtime shim', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'platform', 'windows', 'bin', 'npx.cmd'),
    'utf8'
  );

  it('selects x86 Node.js only on true 32-bit Windows', () => {
    expect(source).toContain('PROCESSOR_ARCHITECTURE');
    expect(source).toContain('PROCESSOR_ARCHITEW6432');
    expect(source).toContain('win-x86');
    expect(source).toContain('win-x64');
  });

  it('keeps downloaded Node.js markers architecture-specific', () => {
    expect(source).toContain('node-v%NODE_VERSION%-%NODE_ARCH%.installed');
  });
});
