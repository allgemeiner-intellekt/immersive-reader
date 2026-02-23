import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.tmp-tests');
const sharedDir = path.join(outDir, 'src', 'shared');

fs.rmSync(outDir, { recursive: true, force: true });

const tscBin = path.join(
  root,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tsc.cmd' : 'tsc'
);

const tsc = spawnSync(tscBin, ['-p', 'tsconfig.test.json'], { cwd: root, stdio: 'inherit' });
if (tsc.status !== 0) {
  process.exit(tsc.status ?? 1);
}

rewriteSharedAliases(outDir, sharedDir);

const testDir = path.join(root, 'test');
const testFiles = fs.existsSync(testDir)
  ? fs
      .readdirSync(testDir)
      .filter((f) => f.endsWith('.test.mjs'))
      .map((f) => path.join('test', f))
  : [];

if (testFiles.length === 0) {
  console.error('No test files found in ./test (*.test.mjs)');
  process.exit(1);
}

const node = spawnSync(
  process.execPath,
  ['--test', '--experimental-specifier-resolution=node', ...testFiles],
  { cwd: root, stdio: 'inherit' }
);

process.exit(node.status ?? 1);

function rewriteSharedAliases(dir, sharedAbsoluteDir) {
  const files = listFiles(dir);
  for (const file of files) {
    if (!file.endsWith('.js')) continue;

    const code = fs.readFileSync(file, 'utf8');
    const rel = path.relative(path.dirname(file), sharedAbsoluteDir);
    let relPosix = rel.split(path.sep).join('/');
    if (relPosix === '') relPosix = '.';
    if (!relPosix.startsWith('.')) relPosix = `./${relPosix}`;

    let rewritten = code;

    // @shared/* -> relative path into src/shared (plus .js for Node ESM)
    rewritten = rewritten.replace(/from\s+(['"])@shared\/([^'"]+)\1/g, (_m, quote, subpath) => {
      const base = relPosix === '.' ? `./${subpath}` : `${relPosix}/${subpath}`;
      return `from ${quote}${base}.js${quote}`;
    });

    // Ensure all relative imports include file extensions for Node ESM.
    rewritten = rewritten.replace(/from\s+(['"])(\.{1,2}\/[^'"]+)\1/g, (m, quote, spec) => {
      if (spec.endsWith('.js') || spec.endsWith('.json') || spec.endsWith('.node')) return m;
      return `from ${quote}${spec}.js${quote}`;
    });

    fs.writeFileSync(file, rewritten, 'utf8');
  }
}

function listFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...listFiles(full));
      continue;
    }
    out.push(full);
  }
  return out;
}
