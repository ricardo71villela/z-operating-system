// Portao de acesso ao Radar Immobilier — Vercel Function (Node.js, sem framework).
//
// PORQUE UMA FUNCAO E NAO SO JAVASCRIPT NO BROWSER: o dashboard e um ficheiro
// estatico com TODOS os dados (moradas, valores estimados, argumentario) ja
// embutidos no HTML em base64. Uma proteccao so em JavaScript no browser NAO
// protege nada de verdade — o ficheiro inteiro, dados incluidos, ja teria sido
// entregue ao visitante antes de qualquer verificacao correr; bastaria ver o
// codigo-fonte da pagina para contornar. Esta funcao corre do lado do servidor
// (nos servidores da Vercel) e so devolve conteudo depois de validar a
// password — sem password certa, nada sai do servidor.
//
// PORQUE EM PEDACOS (chunks): a Vercel limita a 4,5 MB o corpo da resposta de
// qualquer Function. O dashboard (com os dados todos embutidos) passa dos
// 5 MB. Por isso esta funcao nao devolve o HTML completo — devolve uma
// pagina pequena ("bootstrap") que, ja autenticada, pede cada pedaco a
// /api/chunk (cada um bem abaixo do limite) e remonta a pagina completa no
// browser. O browser reenvia a password automaticamente nesses pedidos
// seguintes (HTTP Basic Auth funciona assim), por isso cada pedaco continua
// protegido, nao so o primeiro.
//
// A password fica na variavel de ambiente RADAR_PASSWORD (Vercel -> Settings ->
// Environment Variables), nunca escrita neste ficheiro nem no repositorio git.

const fs = require('fs');
const path = require('path');
const { checkAuth } = require('./_auth');

module.exports = (req, res) => {
  if (!checkAuth(req, res)) return;

  const manifestPath = path.join(process.cwd(), 'private', 'chunks', 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      'Nao encontrei private/chunks/manifest.json.\n' +
      'Corre "node scripts/split-dashboard.js" e faz git push outra vez.'
    );
    return;
  }

  const bootstrap = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Radar Immobilier</title>
<style>
  html,body{height:100%;margin:0;background:#0f1420;color:#c7ccd9;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  #wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;text-align:center;padding:1.5rem}
  #bar{width:min(280px,80vw);height:6px;border-radius:999px;background:#242c40;overflow:hidden}
  #fill{height:100%;width:0%;background:#5b8cff;transition:width .2s ease}
  #err{color:#ff8080;max-width:32rem}
</style>
</head>
<body>
<div id="wrap">
  <div>A carregar o Radar Immobilier…</div>
  <div id="bar"><div id="fill"></div></div>
  <div id="pct">0 %</div>
  <div id="err" hidden></div>
</div>
<script>
(async () => {
  const COUNT = ${manifest.count};
  const fill = document.getElementById('fill');
  const pct = document.getElementById('pct');
  const err = document.getElementById('err');
  try {
    const parts = new Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const r = await fetch('/api/chunk?n=' + i, { cache: 'no-store' });
      if (!r.ok) throw new Error('pedaco ' + i + ' falhou (HTTP ' + r.status + ')');
      parts[i] = await r.text();
      const p = Math.round(((i + 1) / COUNT) * 100);
      fill.style.width = p + '%';
      pct.textContent = p + ' %';
    }
    const html = parts.join('');
    document.open();
    document.write(html);
    document.close();
  } catch (e) {
    err.hidden = false;
    err.textContent = 'Erro ao carregar: ' + e.message + '. Recarrega a pagina para tentar outra vez.';
  }
})();
</script>
</body>
</html>`;

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(bootstrap);
};
