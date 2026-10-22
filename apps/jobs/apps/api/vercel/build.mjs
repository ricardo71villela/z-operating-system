// apps/api/vercel/build.mjs — gera o Build Output da Vercel para a API.
//
// Porquê um bundle: o código é TypeScript em ESM com imports sem
// extensão, que o Node não resolve sozinho. O esbuild junta tudo num
// único ficheiro; o certificado da Supabase vai ao lado, no mesmo
// caminho relativo que pgStore.ts espera (../certs a partir de src/).
// Saída: .vercel/output (https://vercel.com/docs/build-output-api).
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

// Na Vercel as dependências ficam isoladas em .deps (vercel.json): um
// `npm install` normal aqui dentro cairia no workspace da raiz do monorepo.
// Localmente, usa-se o node_modules do monorepo.
const depsDir = join(apiRoot, '.deps', 'node_modules');
const useDeps = existsSync(depsDir);
const { build } = await import(useDeps ? pathToFileURL(join(depsDir, 'esbuild', 'lib', 'main.js')).href : 'esbuild');
const out = join(apiRoot, '.vercel', 'output');
const fn = join(out, 'functions', 'index.func');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(fn, 'src'), { recursive: true });

await build({
  entryPoints: [join(apiRoot, 'vercel', 'handler.ts')],
  outfile: join(fn, 'src', 'index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['pg-native'],
  nodePaths: useDeps ? [depsDir] : [],
  // Dependências CommonJS (pg) dentro de um bundle ESM precisam de require.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});

cpSync(join(apiRoot, 'certs'), join(fn, 'certs'), { recursive: true });
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));
writeFileSync(
  join(fn, '.vc-config.json'),
  JSON.stringify({ runtime: 'nodejs22.x', handler: 'src/index.mjs', launcherType: 'Nodejs', maxDuration: 60, memory: 1024 }, null, 2),
);
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: '/(.*)',
          headers: { 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' },
          continue: true,
        },
        { src: '/(.*)', dest: '/index' },
      ],
    },
    null,
    2,
  ),
);
console.log('Z_JOBS_API_VERCEL_BUILD=PASS');
