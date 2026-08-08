'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const roots = ['apps', 'packages', 'scripts', 'tests'];
const files = [];
function walk(p) {
  if (!fs.existsSync(p)) return;
  for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'vercel-output') continue;
      walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}
roots.forEach(r => walk(path.join(__dirname, '..', r)));

for (const file of files) {
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(res.stderr || res.stdout || `Syntax error: ${file}\n`);
    process.exit(res.status || 1);
  }
}
console.log(`✅ JavaScript syntax validated: ${files.length} files`);
