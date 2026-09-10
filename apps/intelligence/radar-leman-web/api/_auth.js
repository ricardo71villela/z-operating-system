// Validação de password partilhada por api/index.js e api/chunk.js.
// Ficheiro com "_" à frente: a Vercel não o trata como rota própria.

const REALM = 'Radar Immobilier';

// Devolve true se o pedido trouxer a password certa (via HTTP Basic Auth).
// Se não trouxer ou estiver errada, já responde com 401/500 e devolve false —
// quem chamar só precisa de parar (return) quando isto devolver false.
function checkAuth(req, res) {
  const expected = process.env.RADAR_PASSWORD;

  if (!expected) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(
      'RADAR_PASSWORD nao esta configurada nas variaveis de ambiente deste projeto Vercel.\n' +
      'Settings -> Environment Variables -> adicionar RADAR_PASSWORD -> redeploy.'
    );
    return false;
  }

  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', `Basic realm="${REALM}", charset="UTF-8"`);
    res.end('Autenticacao necessaria.');
    return false;
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
    return false;
  }

  return true;
}

module.exports = { checkAuth };
