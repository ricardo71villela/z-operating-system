/* ============================================================
   Z FIND — SEO DEPLOYMENT CONTRACT
   ============================================================ */

'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const seo = require(
  '../../apps/zfind-web/scripts/generate-seo-pages.js'
);

const ROOT = path.resolve(
  __dirname,
  '../..'
);

let pass = 0;
let fail = 0;

function assert(condition, label) {
  if (condition) {
    pass++;
    console.log('  ✅', label);
  } else {
    fail++;
    console.log('  ❌', label);
  }
}

console.log('\n=== 1. robots.txt contract ===');

const robots = seo.buildRobotsTxt(
  'https://zfind.online'
);

assert(
  robots.includes('User-agent: *'),
  'robots applies to all crawlers'
);

assert(
  robots.includes('Allow: /'),
  'robots allows public crawling'
);

assert(
  robots.includes(
    'Sitemap: https://zfind.online/sitemap.xml'
  ),
  'robots references the real canonical sitemap'
);


console.log('\n=== 2. sitemap contract — zero inventory remains valid ===');

const emptySitemap = seo.buildSitemapXml(
  'https://zfind.online',
  []
);

assert(
  emptySitemap.includes(
    '<loc>https://zfind.online/</loc>'
  ),
  'zero-inventory sitemap still contains canonical site root'
);

assert(
  emptySitemap.includes(
    'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
  ),
  'sitemap uses the official sitemap namespace'
);


console.log('\n=== 3. sitemap published-page URLs ===');

const populated = seo.buildSitemapXml(
  'https://zfind.online/',
  [
    'https://zfind.online/en/property/p1',
    'https://zfind.online/en/property/p1',
    'https://zfind.online/pt/zone/z1?x=1&y=2',
  ]
);

assert(
  (
    populated.match(
      /https:\/\/zfind\.online\/en\/property\/p1/g
    ) || []
  ).length === 1,
  'duplicate canonical URLs are emitted only once'
);

assert(
  populated.includes(
    'https://zfind.online/pt/zone/z1?x=1&amp;y=2'
  ),
  'XML-sensitive URL characters are escaped'
);


console.log('\n=== 4. Vercel deployment is fail-fast ===');

const vercelPath = path.join(
  ROOT,
  'apps/zfind-web/vercel.json'
);

const vercel = JSON.parse(
  fs.readFileSync(
    vercelPath,
    'utf8'
  )
);

assert(
  vercel.cleanUrls === true,
  'clean URLs remain enabled'
);

assert(
  vercel.outputDirectory === 'vercel-output',
  'Vercel output directory remains explicit'
);

assert(
  vercel.installCommand ===
    'cd ../../../.. && npm ci',
  'Vercel installs dependencies from the npm workspace root'
);

const monorepoRoot = path.resolve(
  ROOT,
  '../..'
);

const monorepoPackage = JSON.parse(
  fs.readFileSync(
    path.join(
      monorepoRoot,
      'package.json'
    ),
    'utf8'
  )
);

const findPackage = JSON.parse(
  fs.readFileSync(
    path.join(
      ROOT,
      'package.json'
    ),
    'utf8'
  )
);

const monorepoLock = JSON.parse(
  fs.readFileSync(
    path.join(
      monorepoRoot,
      'package-lock.json'
    ),
    'utf8'
  )
);

assert(
  monorepoPackage.workspaces.includes(
    'apps/find'
  ),
  'root npm workspace explicitly owns apps/find'
);

assert(
  !!findPackage.dependencies[
    '@supabase/supabase-js'
  ],
  'Z Find declares its Supabase build dependency'
);

assert(
  !!monorepoLock.packages[
    'node_modules/@supabase/supabase-js'
  ],
  'root lockfile contains the Supabase dependency required by deployment'
);

assert(
  vercel.buildCommand.includes(
    'generate-seo-pages.js'
  ),
  'deployment build invokes SEO generation'
);

assert(
  !vercel.buildCommand.includes(
    '|| true'
  ),
  'deployment cannot swallow an SEO generation failure'
);


console.log('\n=== 5. Vercel output assembler requires indexing artifacts ===');

const prepareSource = fs.readFileSync(
  path.join(
    ROOT,
    'apps/zfind-web/scripts/prepare-vercel-output.js'
  ),
  'utf8'
);

assert(
  prepareSource.includes("'robots.txt'") &&
  prepareSource.includes("'sitemap.xml'"),
  'output assembler requires robots.txt and sitemap.xml'
);

assert(
  prepareSource.includes(
    'copyRecursive('
  ) &&
  prepareSource.includes(
    'seoSrc'
  ),
  'output assembler copies generated SEO tree into deployment root'
);


console.log('\n=== 6. Explicit SEO generation refuses missing public data config ===');

const generatorScript = path.join(
  ROOT,
  'apps/zfind-web/scripts/generate-seo-pages.js'
);

const childEnv = {
  ...process.env,
};

delete childEnv.SUPABASE_URL;
delete childEnv.SUPABASE_ANON_KEY;
delete childEnv.SITE_BASE_URL;

const result = spawnSync(
  process.execPath,
  [
    generatorScript,
  ],
  {
    env: childEnv,
    encoding: 'utf8',
  }
);

const diagnostic =
  String(result.stdout || '') +
  String(result.stderr || '');

assert(
  result.status !== 0,
  'explicit SEO generation fails when required config is absent'
);

assert(
  diagnostic.includes(
    'SUPABASE_URL'
  ) &&
  diagnostic.includes(
    'SUPABASE_ANON_KEY'
  ),
  'failure clearly names the missing required public configuration'
);


console.log('\n============================================================');
console.log(`RESULT: ${pass} passed, ${fail} failed`);
console.log('============================================================');

if (fail > 0) {
  process.exitCode = 1;
}
