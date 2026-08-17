// src/state/state.js — o estado global da aplicação (single source of truth
// em memória). Um único objeto simples, sem lógica — quem lê/escreve são as
// funções em src/main.js. Extraído na Phase 2 (continuação) da auditoria.

// ═══ ESTADO ═══
const FORMATS = { feed45: [1080, 1350], square: [1080, 1080], story: [1080, 1920], wide: [1920, 1080], pin: [1000, 1500] };
const state = {
  lang: 'pt', source: 'upload', format: 'feed45', template: 'classico',
  photo: null, img: null,
  title: '', price: '', loc: '', badge: '', showSpecs: true, bg: 'dark',
  photos: [], carPhotos: [], photoFiles: [],
  slides: [], slideIdx: 0,
  // recorte inteligente + filtro de imagem (nome do preset em PHOTO_FILTERS)
  smartCrop: true, filter: 'auto',
  cropAdjust: {}, // { [urlDaFoto]: {panX, panY, zoom} } — ajuste manual de enquadramento, por foto
  // categoria + ficha de produto — universal: imóveis, carros, viagens, cosmética,
  // roupa, sapatos, ou qualquer outra coisa. Rótulos e valores totalmente editáveis.
  category: 'generico',
  _styleCustomized: false, // true assim que a pessoa escolhe cor/fundo à mão — a partir daí a categoria deixa de sugerir automaticamente
  // campos extra específicos de certas categorias — só aparecem/contam quando
  // a categoria ativa os usa (ver renderCategoryExtras)
  energyRating: '', starRating: 0, allergens: [], sizes: [],
  financeMonths: 60, financeDownPct: 20, financeAPR: 7.9,
  spec: [ { label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' }, { label: '', value: '' } ],
  // marca — nome, cor, site, com ou sem marca de água
  brand: { name: 'My Studio', site: '', sub: '', phone: '', accent: '#B8935A',
           showWatermark: true, logoUrl: null, langs: new Set(['pt', 'en']) }
};

