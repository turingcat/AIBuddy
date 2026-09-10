const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function verifyWin7Uv(directory) {
  const manifestPath = path.join(directory, 'win7-uv.json');
  if (!fs.existsSync(manifestPath))
    throw new Error('Missing locally built Win7 uv runtime manifest');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.target !== 'i686-win7-windows-msvc' || manifest.version !== '0.11.11') {
    throw new Error('Wrong Win7 uv target or version');
  }
  for (const name of ['uv.exe', 'uvx.exe']) {
    const digest = crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(directory, name)))
      .digest('hex');
    if (digest !== manifest.hashes[name]) throw new Error(`Win7 ${name} checksum mismatch`);
  }
}

module.exports = { verifyWin7Uv };
