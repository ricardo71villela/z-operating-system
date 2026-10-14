// Copies zfashion-auth.js into each static staff surface (byte-for-byte).
// Run after editing the source: node apps/fashion/packages/fashion-web-auth/sync.js
const fs = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, 'zfashion-auth.js');
const TARGETS = [
  path.join(__dirname, '..', '..', 'apps', 'fashion-admin', 'zfashion-auth.js'),
  path.join(__dirname, '..', '..', 'apps', 'fashion-partner', 'public', 'zfashion-auth.js'),
];

if (require.main === module) {
  const src = fs.readFileSync(SOURCE);
  for (const target of TARGETS) {
    fs.writeFileSync(target, src);
    console.log('synced', path.relative(process.cwd(), target));
  }
}

module.exports = { SOURCE, TARGETS };
