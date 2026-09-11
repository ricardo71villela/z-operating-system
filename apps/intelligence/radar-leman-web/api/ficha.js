// Devolve uma ficha PDF individual (private/fichas/shard-N.js, importado com
// require()), depois de validar a mesma password que api/index.js exige.
// Mesmo principio do api/chunk.js: cada PDF fica embutido em base64 dentro
// de um modulo JS, para o empacotador da Vercel o incluir sempre no bundle
// da funcao (sem depender de "includeFiles", que ja vimos nao funcionar
// neste monorepo). Cada resposta e um unico PDF (~20-30 KB), bem abaixo do
// limite de 4,5 MB da Vercel.

const { checkAuth } = require('./_auth');
const fichas = require('../private/fichas/index.js');

module.exports = (req, res) => {
  if (!checkAuth(req, res)) return;

  const n = parseInt((req.query && req.query.n) ?? '', 10);
  if (!Number.isInteger(n) || n < 0 || n >= fichas.length) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Parametro "n" invalido.');
    return;
  }

  const pdf = Buffer.from(fichas[n], 'base64');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="fiche_${String(n + 1).padStart(4, '0')}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(pdf);
};
