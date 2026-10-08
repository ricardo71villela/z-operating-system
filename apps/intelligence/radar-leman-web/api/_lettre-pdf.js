// Carta de prospecao "ao proprietario" (uma pagina A4), seguida da ficha de
// estimativa da mesma morada. Nenhum nome de proprietario e usado: a carta e
// dirigida "Au propriétaire" na morada do bem (dados publicos apenas).
// O endereco do destinatario fica na posicao da janela de um envelope DL
// (a direita, ~45 mm do topo).

const { drawFiche, clean, CABINET, MOIS, MARGINS, NAVY, GREY, LIGHT, FIELDS: F } = require('./_fiche-pdf');

function splitAdresse(adresse) {
  const s = clean(adresse);
  const i = s.lastIndexOf(', ');
  return i > 0 ? [s.slice(0, i), s.slice(i + 2)] : [s, ''];
}

function communeOf(adresse) {
  const [, cpVille] = splitAdresse(adresse);
  return cpVille.replace(/^\d{5}\s*/, '') || 'votre commune';
}

function dateFr(now) {
  return now.getDate() + (now.getDate() === 1 ? 'er' : '') + ' ' + MOIS[now.getMonth()] + ' ' + now.getFullYear();
}

function corps(row) {
  const commune = communeOf(row[F.adresse]);
  const p = [];
  const tendance = row[F.argPrudent] ? clean(row[F.argPrudent]).replace(/^Dans ce secteur, /, '').replace(/\.$/, '') : null;
  p.push(tendance
    ? `Le marché immobilier de ${commune} évolue : dans votre secteur, ${tendance}.`
    : `Le marché immobilier de ${commune} évolue, et plusieurs ventes ont été enregistrées récemment près de chez vous.`);
  p.push("Vous trouverez au verso une estimation indicative de votre bien, établie à partir des ventes réelles publiées par " +
    "l'administration fiscale et des données publiques du bâtiment. Ce n'est qu'une fourchette : seule une visite permet de " +
    "tenir compte de l'état, de l'exposition et des prestations.");
  const dpe = String(row[F.dpe] || '').toUpperCase();
  if (['E', 'F', 'G'].includes(dpe)) {
    p.push(`Votre logement semble classé ${dpe} au diagnostic de performance énergétique. Les échéances de la loi ` +
      'Climat et Résilience peuvent peser sur un projet de location ou de vente ; je peux vous présenter les options possibles.');
  }
  p.push('Si vous réfléchissez à un projet de vente, ou souhaitez simplement connaître la valeur précise de votre bien, ' +
    'je me tiens à votre disposition pour une estimation gratuite et sans engagement.');
  return p;
}

// Desenha a carta numa pagina nova de `doc`.
function drawLettre(doc, row, now = new Date()) {
  doc.addPage({ size: 'A4', margins: MARGINS });
  const L = MARGINS.left;
  const W = doc.page.width - L - MARGINS.right;
  const text = (s, x, y, opts) => { doc.text(clean(s), x, y, Object.assign({ lineGap: 2 }, opts)); return doc.y; };

  // Remetente
  doc.font('B').fontSize(13).fillColor(NAVY);
  text(CABINET.nom, L, MARGINS.top);
  doc.font('R').fontSize(8.5).fillColor(GREY);
  text(CABINET.baseline, L, MARGINS.top + 18, { width: 260 });
  text(CABINET.contact, L, doc.y + 2, { width: 260 });

  // Destinatario (janela do envelope)
  const [ligne1, ligne2] = splitAdresse(row[F.adresse]);
  doc.font('R').fontSize(11).fillColor('#1A1A1A');
  let y = 128;
  const xDest = L + W * 0.52;
  y = text('Au propriétaire', xDest, y, { width: W * 0.48 });
  y = text(ligne1, xDest, y, { width: W * 0.48 });
  text(ligne2, xDest, y, { width: W * 0.48 });

  // Data e objeto
  y = 245;
  doc.font('R').fontSize(10).fillColor('#1A1A1A');
  text((CABINET.ville ? CABINET.ville + ', le ' : 'Le ') + dateFr(now), xDest, y, { width: W * 0.48 });
  y += 34;
  doc.font('B').fontSize(10.5).fillColor(NAVY);
  y = text('Objet : votre bien au ' + clean(row[F.adresse]) + ' — estimation offerte', L, y, { width: W }) + 18;

  // Corpo
  doc.font('R').fontSize(10.5).fillColor('#1A1A1A');
  y = text('Madame, Monsieur,', L, y, { width: W }) + 10;
  for (const para of corps(row)) y = text(para, L, y, { width: W, align: 'justify' }) + 9;
  y = text("Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.", L, y + 2, { width: W }) + 26;

  doc.font('B').fontSize(10.5).fillColor(NAVY);
  y = text(CABINET.signataire, xDest, y, { width: W * 0.48 });
  doc.font('R').fontSize(9.5).fillColor(GREY);
  text(CABINET.nom, xDest, y + 1, { width: W * 0.48 });

  // Rodape (RGPD)
  doc.font('R').fontSize(7.5).fillColor(LIGHT);
  text("Ce courrier est adressé au propriétaire de ce logement à partir de données publiques (adresse, ventes " +
    "enregistrées, diagnostics) ; aucune donnée personnelle n'a été utilisée. Pour ne plus recevoir de courrier de notre " +
    'part, il vous suffit de nous le signaler.', L, doc.page.height - MARGINS.bottom - 30, { width: W });
}

// Carta + ficha para cada morada, num so documento.
function drawLettreEtFiche(doc, row, now) {
  drawLettre(doc, row, now);
  drawFiche(doc, row, now);
}

module.exports = { drawLettre, drawLettreEtFiche, splitAdresse, corps };
