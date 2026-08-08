'use strict';
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter(f => /^\d{4}_.+\.sql$/.test(f)).sort();
if (!files.length) throw new Error('No migrations found');

const numbers = files.map(f => Number(f.slice(0, 4)));
for (let i = 0; i < numbers.length; i += 1) {
  const expected = i + 1;
  if (numbers[i] !== expected) throw new Error(`Migration gap/order error: expected ${String(expected).padStart(4,'0')}, found ${files[i]}`);
}

for (const file of files) {
  const sql = fs.readFileSync(path.join(dir, file), 'utf8');
  if (/service_role/i.test(sql) && !/^0001_|^0002_/.test(file)) {
    // Mentioning service_role in old security commentary is tolerated only in
    // historical migrations. New migrations should not depend on it.
    throw new Error(`New migration must not depend on service_role: ${file}`);
  }
  if (/drop\s+table|drop\s+column/i.test(sql)) throw new Error(`Destructive migration detected: ${file}`);
}

console.log(`✅ ${files.length} sequential, additive migrations validated (${files[0]} → ${files[files.length-1]})`);
