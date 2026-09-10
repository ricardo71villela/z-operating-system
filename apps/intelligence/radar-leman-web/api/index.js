// Portao de acesso ao Radar Immobilier — Vercel Function (Node.js, sem framework).
//
// PORQUE UMA FUNCAO E NAO SO JAVASCRIPT NO BROWSER: o dashboard e um ficheiro
// estatico com TODOS os dados (moradas, valores estimados, argumentario) ja
// embutidos no HTML em base64. Uma proteccao so em JavaScript no browser NAO
// protege nada de verdade — o ficheiro inteiro, dados incluidos, ja teria sido
// entregue ao visitante antes de qualquer verificacao correr; bastaria ver o
// codigo-fonte da pagina para contornar. Esta funcao corre do lado do servidor
// (nos servidores da Vercel) e so devolve o HTML depois de validar a password —
// sem password certa, o ficheiro nunca sai do servidor.
//
// A password fica na variavel de ambiente RADAR_PASSWORD (Vercel -> Settings ->
// Environment Variables), nunca escrita neste ficheiro nem no repositorio git.

const fs = require('fs');
const path = require('path');

const REALM = 'Radar Immobilier';

module.exports = (req, res) => {
  const expected = process.env.RADAR_PASSWORD;

  if (!expected) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      'RADAR_PASSWORD nao esta configurada nas variaveis de ambiente deste projeto Vercel.\n' +
      'Settings -> Environment Variables -> adicionar RADAR_PASSWORD -> redeploy.'
    );
    return;
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`);
    res.end('Autenticacao necessaria.');
    return;
  }

  let password = '';
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    password = sep === -1 ? decoded : decoded.slice(sep + 1);
  } catch {
    password = '';
  }

  if (password !== expected) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`);
    res.end('Password incorreta.');
    return;
  }

  const filePath = path.join(process.cwd(), 'private', 'dashboard.html');
  const html = fs.readFileSync(filePath, 'utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(html);
};
