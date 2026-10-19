#!/usr/bin/env node
/* Before the launch: fails while the legal texts still contain
   information to provide ({{...}} in apps/fashion-web/legal-content.js:
   the company that runs Z Fashion, the consumer mediator...).
   Run: node apps/fashion/scripts/check-legal-ready.js */
const legal = require('../apps/fashion-web/legal-content.js');
const missing = legal.placeholders();
if (missing.length) {
  console.error(`Z Fashion legal texts: ${missing.length} item(s) to complete before the launch:`);
  for (const m of missing) console.error(`  - ${m}`);
  process.exit(1);
}
console.log(`Z Fashion legal texts ready (customer ${legal.VERSION.customer}, partner ${legal.VERSION.partner}).`);
