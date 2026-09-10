// Devolve um pedaco de private/chunks/chunk-N.txt, depois de validar a
// mesma password que api/index.js exige. Ver a explicacao completa em
// api/index.js — isto existe por causa do limite de 4,5 MB da Vercel.

const fs = require('fs');
const path = require('path');
const { checkAuth } = require('./_auth');

module.exports = (req, res) => {
  if (!checkAuth(req, res)) return;

  const n = parseInt((req.query && req.query.n) ?? '', 10);
  if (!Number.isInteger(n) || n < 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Parametro "n" invalido.');
    return;
  }

  const chunkPath = path.join(process.cwd(), 'private', 'chunks', `chunk-${n}.txt`);
  let content;
  try {
    content = fs.readFileSync(chunkPath, 'utf8');
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(`Pedaco ${n} nao encontrado.`);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(content);
};
