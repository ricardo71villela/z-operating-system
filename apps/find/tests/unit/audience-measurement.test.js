/* Contract: cookieless audience measurement (Vercel Web Analytics) with clean hash-route paths. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const WEB = path.join(__dirname, '..', '..', 'apps', 'zfind-web');
const head = fs.readFileSync(path.join(WEB, 'src', 'head_top.txt'), 'utf8');
const legal = fs.readFileSync(path.join(WEB, 'src', 'services', 'website-legal-runtime.js'), 'utf8');
let passed = 0;
const check = (label, value) => { assert(value, label); passed += 1; console.log('PASS:', label); };

console.log('\n=== Z FIND AUDIENCE MEASUREMENT ===');
check('Vercel Web Analytics script is loaded from the site itself', head.includes('<script defer src="/_vercel/insights/script.js"></script>'));
const inline = head.match(/<script>\s*\/\* Audience measurement[\s\S]*?<\/script>/);
check('beforeSend hook is defined before the script', !!inline && head.indexOf(inline[0]) < head.indexOf('/_vercel/insights/script.js'));
const context = { window: {}, URL, URLSearchParams, Object };
vm.createContext(context);
vm.runInContext(inline[0].replace(/<\/?script>/g, ''), context);
const hook = context.window.vaq.find(args => args[0] === 'beforeSend')[1];
const send = url => hook({ type: 'pageview', url }).url;
check('hash route becomes a clean path', send('https://zfind.online/#/fr/market/FR?div=84.74') === 'https://zfind.online/fr/market/FR?div=84.74');
check('free text, e-mails and filters never leave the browser',
  send('https://zfind.online/#/fr/search?market=FR&transactionType=sale&q=Rue%20de%20la%20Paix%2012&commune=FR%3A74119&priceMax=450000') === 'https://zfind.online/fr/search?market=FR&transactionType=sale');
check('home page', send('https://zfind.online/') === 'https://zfind.online/');
check('cookie notice says what is measured, without cookies', legal.includes('Vercel Web Analytics, sans cookie') && legal.includes('Vercel Web Analytics, without cookies'));
console.log(`\nAUDIENCE MEASUREMENT: ${passed}/${passed} PASSED`);
