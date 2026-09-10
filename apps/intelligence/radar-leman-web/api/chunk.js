// Devolve um pedaco (private/chunks/chunk-N.js, importado com require()),
// depois de validar a mesma password que api/index.js exige. Ver a
// explicacao completa em api/index.js — isto existe por causa do limite de
// 4,5 MB da Vercel.

const { checkAuth } = require('./_auth');
const chunks = require('../private/chunks/index.js');

module.exports = (req, res) => {
  if (!checkAuth(req, res)) return;

  const n = parseInt((req.query && req.query.n) ?? '', 10);
  if (!Number.isInteger(n) || n < 0 || n >= chunks.length) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Parametro "n" invalido.');
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(chunks[n]);
};
