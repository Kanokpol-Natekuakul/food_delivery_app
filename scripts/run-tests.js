import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const subdirs = fs.readdirSync(dir);
  const files = subdirs.map((subdir) => {
    const res = path.resolve(dir, subdir);
    return fs.statSync(res).isDirectory() ? getFiles(res) : res;
  });
  return files.flat();
}

const testFiles = getFiles('packages/domain/src')
  .filter((f) => f.endsWith('.test.ts'))
  .map((f) => path.relative(process.cwd(), f));

console.log(`[Test Runner] Found ${testFiles.length} test files.`);

if (testFiles.length === 0) {
  console.error('[Test Runner] No test files found!');
  process.exit(1);
}

const result = spawnSync('node', [
  '--import', 'tsx',
  '--test',
  ...testFiles
], { stdio: 'inherit', shell: true });

process.exit(result.status ?? 1);
