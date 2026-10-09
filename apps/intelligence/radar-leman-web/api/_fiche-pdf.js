// Gera a ficha PDF de uma morada A PEDIDO, a partir dos dados do dashboard.
// Substitui os ~27 000 PDFs que estavam guardados no repositorio (cerca de
// 700 MB a cada atualizacao do site). Mesmo conteudo e mesma apresentacao
// que fiche_pdf.py (pipeline) — so o motor muda (PDFKit em vez de WeasyPrint).
// Ficheiro com "_" a frente: a Vercel nao o trata como rota.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Arimo (SIL Open Font License 1.1) : metricas iguais as da Helvetica/Arial,
// e embebida no PDF — assim "m²", "€" e os acentos aparecem em qualquer leitor.
const FONT_R = fs.readFileSync(path.join(__dirname, '_fonts', 'Arimo-Regular.ttf'));
const FONT_B = fs.readFileSync(path.join(__dirname, '_fonts', 'Arimo-Bold.ttf'));

const NAVY = '#0B2545';
const TEAL = '#00A0B0';
const GREY = '#6B7280';
const LIGHT = '#9AA3AF';
const FOURCHETTE = 0.07;
// Identidade do remetente : variaveis de ambiente do projeto Vercel
// (Settings -> Environment Variables), para mudar sem tocar no codigo.
const CABINET = {
  nom: process.env.RADAR_AGENCE_NOM || '[Votre agence]',
  baseline: process.env.RADAR_AGENCE_BASELINE || 'Estimation et transaction — Chablais / Léman',
  contact: process.env.RADAR_AGENCE_CONTACT || '[téléphone] · [email] · [adresse]',
  signataire: process.env.RADAR_SIGNATAIRE || '[Prénom Nom]',
  ville: process.env.RADAR_AGENCE_VILLE || ''
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Campos de cada morada (mesma ordem que scripts/update-from-pipeline.py).
const F = { adresse: 0, type: 1, surface: 2, annee: 3, dpe: 4, prixM2: 5, valeur: 6,
  comparables: 7, argPrudent: 8, argDpe: 9 };

const isNum = v => typeof v === 'number' && Number.isFinite(v);
// Separador de milhares com espaco normal: as fontes PDF de base nao tem o
// espaco fino (U+202F) que o Intl usa em frances.
const fmtInt = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const fmtEur = v => (isNum(v) ? fmtInt(v) + ' €' : '—');
const clean = s => String(s == null ? '' : s).replace(/[  ]/g, ' ');

function arrondiCommercial(v) {
  const pas = v >= 200000 ? 5000 : 1000;
  return Math.round(v / pas) * pas;
}

function parseComparables(s) {
  if (typeof s !== 'string' || !s) return [];
  const out = [];
  for (const part of clean(s).split(' ; ')) {
    const m = part.trim().match(/^(\d{4}) — ([\d ]+) m² — ([\d ]+) €\/m²$/);
    if (!m) continue;
    const surface = parseInt(m[2].replace(/\D/g, ''), 10);
    const pm2 = parseInt(m[3].replace(/\D/g, ''), 10);
    out.push({ annee: m[1], surface, prix: Math.round(surface * pm2 / 100) * 100, pm2 });
  }
  return out.slice(0, 5);
}

const MARGINS = { top: 42.5, bottom: 42.5, left: 45.4, right: 45.4 };

// Documento A4 com as fontes Arimo registadas ('R' normal, 'B' negrito).
function newDoc(title) {
  const doc = new PDFDocument({ font: null, size: 'A4', margins: MARGINS, autoFirstPage: false,
    info: { Title: clean(title), Producer: 'Radar Léman' } });
  doc.registerFont('R', FONT_R);
  doc.registerFont('B', FONT_B);
  return doc;
}

function renderFiche(row, now = new Date()) {
  const doc = newDoc('Estimation indicative — ' + clean(row[F.adresse]));
  drawFiche(doc, row, now);
  return doc;
}

// Desenha a ficha numa pagina nova do documento `doc`.
function drawFiche(doc, row, now = new Date()) {
  doc.addPage({ size: 'A4', margins: MARGINS });
  const L = doc.page.margins.left;
  const W = doc.page.width - L - doc.page.margins.right;
  let y = doc.page.margins.top;

  const text = (s, x, yy, opts) => { doc.text(clean(s), x, yy, Object.assign({ lineGap: 1.5 }, opts)); return doc.y; };
  const height = (s, w, opts) => doc.heightOfString(clean(s), Object.assign({ width: w, lineGap: 1.5 }, opts));
  const h2 = title => {
    y += 13;
    doc.font('B').fontSize(9).fillColor(NAVY);
    text(title.toUpperCase(), L, y, { characterSpacing: 1.1, width: W });
    y += 14;
    doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.8).strokeColor('#D8DCE1').stroke();
    y += 7;
  };

  // En-tête
  doc.font('B').fontSize(15).fillColor(NAVY);
  text(CABINET.nom, L, y);
  doc.font('R').fontSize(8.5).fillColor(GREY);
  text(MOIS[now.getMonth()] + ' ' + now.getFullYear(), L, y + 20, { width: W, align: 'right' });
  text(CABINET.baseline, L, y + 20);
  y += 36;
  doc.moveTo(L, y).lineTo(L + W, y).lineWidth(3).strokeColor(NAVY).stroke();
  y += 16;

  doc.font('B').fontSize(8).fillColor(TEAL);
  text("ESTIMATION INDICATIVE — À L'ATTENTION DU PROPRIÉTAIRE", L, y, { characterSpacing: 1.4, width: W });
  y += 14;
  doc.font('B').fontSize(17).fillColor(NAVY);
  y = text(row[F.adresse], L, y, { width: W }) + 12;

  // Valeur indicative
  const surface = row[F.surface];
  const prixM2 = row[F.prixM2];
  let valeur = row[F.valeur];
  if (!isNum(valeur) && isNum(prixM2) && isNum(surface)) valeur = prixM2 * surface;
  let val, sub;
  if (isNum(valeur)) {
    val = fmtEur(arrondiCommercial(valeur * (1 - FOURCHETTE))) + ' – ' + fmtEur(arrondiCommercial(valeur * (1 + FOURCHETTE)));
    sub = 'Fourchette indicative, sous réserve de visite' +
      (isNum(prixM2) && isNum(surface) ? ' · ' + fmtEur(prixM2) + '/m² · ' + Math.trunc(surface) + ' m²' : '');
  } else if (isNum(prixM2)) {
    val = fmtEur(prixM2) + ' / m²';
    sub = 'Prix de référence du secteur — surface du bien non connue';
  } else {
    val = 'Sur demande';
    sub = 'Données publiques insuffisantes pour cette adresse';
  }
  const boxH = 74;
  doc.rect(L, y, W, boxH).fill('#F4F7FB');
  doc.rect(L, y, 4, boxH).fill(NAVY);
  doc.font('B').fontSize(8).fillColor(GREY);
  text('VALEUR INDICATIVE DE VOTRE BIEN', L + 17, y + 12, { characterSpacing: 1 });
  doc.font('B').fontSize(21).fillColor(NAVY);
  text(val, L + 17, y + 25);
  doc.font('R').fontSize(8.5).fillColor(GREY);
  text(sub, L + 17, y + 54, { width: W - 30 });
  y += boxH + 4;

  // Ce que nous savons
  const cells = [];
  if (row[F.type]) cells.push(['Type', row[F.type]]);
  if (isNum(surface)) cells.push(['Surface', Math.trunc(surface) + ' m²']);
  if (isNum(row[F.annee])) cells.push(['Construction', String(Math.trunc(row[F.annee]))]);
  if (row[F.dpe]) cells.push(['DPE', row[F.dpe]]);
  if (cells.length) {
    h2('Ce que nous savons de ce bien');
    const gap = 10;
    const cw = (W - gap * (cells.length - 1)) / cells.length;
    cells.forEach(([k, v], i) => {
      const x = L + i * (cw + gap);
      doc.roundedRect(x, y, cw, 40, 3).fill('#F8F9FB');
      doc.font('R').fontSize(7.5).fillColor(GREY);
      text(k.toUpperCase(), x + 11, y + 8, { characterSpacing: 0.6, width: cw - 16 });
      doc.font('B').fontSize(12).fillColor(NAVY);
      text(v, x + 11, y + 20, { width: cw - 16 });
    });
    y += 44;
  }

  // Ventes comparables
  const comps = parseComparables(row[F.comparables]);
  if (comps.length) {
    h2('Ventes réelles à proximité immédiate');
    const cols = [['Année', 0.17, 'left'], ['Type', 0.17, 'left'], ['Surface', 0.22, 'right'],
      ['Prix', 0.22, 'right'], ['Prix/m²', 0.22, 'right']];
    const rowH = 19;
    const drawRow = (vals, yy, header, shade) => {
      if (header) doc.rect(L, yy, W, rowH).fill(NAVY);
      else if (shade) doc.rect(L, yy, W, rowH).fill('#F8F9FB');
      let x = L;
      cols.forEach(([, frac, align], i) => {
        const w = W * frac;
        doc.font(header ? 'B' : 'R').fontSize(header ? 8 : 9.5).fillColor(header ? '#FFFFFF' : '#1A1A1A');
        text(header ? vals[i].toUpperCase() : vals[i], x + 9, yy + (header ? 6 : 5), { width: w - 18, align, characterSpacing: header ? 0.5 : 0 });
        x += w;
      });
      if (!header) doc.moveTo(L, yy + rowH).lineTo(L + W, yy + rowH).lineWidth(0.6).strokeColor('#E8EBEE').stroke();
    };
    drawRow(cols.map(c => c[0]), y, true);
    y += rowH;
    comps.forEach((c, i) => {
      drawRow([c.annee, '—', c.surface + ' m²', fmtEur(c.prix), fmtEur(c.pm2) + '/m²'], y, false, i % 2 === 1);
      y += rowH;
    });
    doc.font('R').fontSize(7.5).fillColor(LIGHT);
    y = text('Source : Demandes de Valeurs Foncières (DGFiP) — transactions notariées, rayon de 400 m.', L, y + 5, { width: W });
  }

  // Le marché de votre secteur
  const argPrudent = row[F.argPrudent];
  const argDpe = row[F.argDpe];
  if (argPrudent || argDpe) {
    h2('Le marché de votre secteur');
    if (argPrudent) {
      doc.font('R').fontSize(10).fillColor('#1A1A1A');
      y = text(argPrudent, L, y, { width: W }) + 6;
    }
    if (argDpe) {
      doc.font('R').fontSize(9.5);
      const h = 14 + height(argDpe, W - 32) + 20;
      y += 4;
      doc.rect(L, y, W, h).fill('#FEF3E2');
      doc.rect(L, y, 4, h).fill('#D97706');
      doc.font('B').fontSize(9.5).fillColor('#92400E');
      text('Performance énergétique', L + 16, y + 10);
      doc.font('R').fontSize(9.5).fillColor('#1A1A1A');
      text(argDpe, L + 16, y + 24, { width: W - 32 });
      y += h + 4;
    }
  }

  // Appel à l'action
  const ctaTxt = "Cette fourchette repose sur les transactions publiques du secteur. L'état intérieur, " +
    "l'exposition, l'étage et la vue peuvent la faire varier sensiblement — dans les deux sens. " +
    "L'estimation sur place est gratuite et sans engagement.";
  doc.font('R').fontSize(9);
  const ctaH = 13 + 16 + height(ctaTxt, W - 32) + 12 + 12 + 13;
  y += 16;
  doc.roundedRect(L, y, W, ctaH, 4).fill(NAVY);
  doc.font('B').fontSize(11).fillColor('#FFFFFF');
  text('Une estimation précise suppose une visite.', L + 16, y + 13);
  doc.font('R').fontSize(9).fillColor('#B9C6DA');
  const yy = text(ctaTxt, L + 16, y + 30, { width: W - 32 });
  text(CABINET.contact, L + 16, yy + 10, { width: W - 32 });
  y += ctaH + 12;

  // Pied de page
  doc.moveTo(L, y).lineTo(L + W, y).lineWidth(0.6).strokeColor('#E8EBEE').stroke();
  doc.font('R').fontSize(7.5).fillColor(LIGHT);
  text('Document établi à partir de données publiques : Base Adresse Nationale (IGN), Demandes de Valeurs ' +
    'Foncières (DGFiP) et diagnostics de performance énergétique (ADEME). Aucune donnée personnelle n\'a été ' +
    'utilisée. Ce document ne constitue pas une expertise ni une offre d\'achat. Pour ne plus recevoir de ' +
    'courrier de notre part, il vous suffit de nous le signaler.', L, y + 7, { width: W });
}

// Fecha o documento e devolve o PDF como Buffer.
function docBuffer(doc) {
  return new Promise((resolve, reject) => {
    const parts = [];
    doc.on('data', b => parts.push(b));
    doc.on('end', () => resolve(Buffer.concat(parts)));
    doc.on('error', reject);
    doc.end();
  });
}

function ficheBuffer(row, now) {
  return docBuffer(renderFiche(row, now));
}

module.exports = { ficheBuffer, docBuffer, newDoc, drawFiche, parseComparables, clean, isNum,
  CABINET, MOIS, MARGINS, NAVY, GREY, LIGHT, FIELDS: F };
