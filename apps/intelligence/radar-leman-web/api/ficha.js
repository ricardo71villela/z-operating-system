// Devolve a ficha PDF de uma morada (?n=<fichaIdx>), gerada A PEDIDO a partir
// dos dados em private/fichas-data/ (gerados por scripts/build-fichas-data.js),
// depois de validar a mesma password que api/index.js exige.
//
// Antes (ate 8/out/2026) as ~27 000 fichas eram PDFs guardados em base64 no
// repositorio (private/fichas/, cerca de 700 MB por atualizacao). Agora so os
// dados (~10 MB) ficam no repositorio; cada PDF (~5 KB) e gerado em poucos
// milissegundos quando alguem o abre.

const { checkAuth } = require('./_auth');
const { ficheBuffer } = require('./_fiche-pdf');
const rows = require('../private/fichas-data/index.js');

module.exports = async (req, res) => {
  if (!checkAuth(req, res)) return;

  const n = parseInt((req.query && req.query.n) ?? '', 10);
  if (!Number.isInteger(n) || n < 0 || n >= rows.length || !rows[n]) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Parametro "n" invalido.');
    return;
  }

  try {
    const pdf = await ficheBuffer(rows[n]);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="fiche_${String(n + 1).padStart(5, '0')}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(pdf);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Erro ao gerar a ficha.');
  }
};
