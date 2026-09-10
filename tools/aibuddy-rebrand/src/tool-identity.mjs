import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function toolIdentity(input, root = fileURLToPath(new URL('../', import.meta.url))) {
  if (!['product', 'upstream'].includes(input)) throw new Error('invalid transformation input');
  const files = [];
  async function collect(relativePath) {
    const entryPath = join(root, relativePath);
    const info = await lstat(entryPath);
    if (info.isSymbolicLink()) throw new Error(`tool input must not be a symlink: ${relativePath}`);
    if (info.isDirectory()) {
      for (const name of (await readdir(entryPath)).sort()) await collect(`${relativePath}/${name}`);
    } else if (info.isFile()) {
      files.push([relativePath, createHash('sha256').update(await readFile(entryPath)).digest('hex')]);
    } else {
      throw new Error(`unsupported tool input: ${relativePath}`);
    }
  }
  for (const name of [
    'cli.mjs', 'package.json', 'package-lock.json', 'brand-map.json', 'production-policy.json', 'text-policy.json',
    'map.json', 'map.schema.json', 'src', 'rust-parser/Cargo.toml', 'rust-parser/Cargo.lock', 'rust-parser/src',
  ]) await collect(name);
  files.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return createHash('sha256').update(JSON.stringify({ version: 1, input, node: process.version, files })).digest('hex');
}
