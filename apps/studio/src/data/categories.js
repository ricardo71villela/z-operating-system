// src/data/categories.js — Categorias: rótulos de ficha, paletas sugeridas,
// selos rápidos, e os campos extra (certificado energético, alergénios,
// tamanhos). Extraído de app/my-studio.html — Phase 2 da auditoria.

const ENERGY_LEVELS = ['A+', 'A', 'B', 'C', 'D', 'E', 'F'];
const ENERGY_EMOJI = { 'A+':'🟢', 'A':'🟢', 'B':'🟢', 'C':'🟡', 'D':'🟡', 'E':'🟠', 'F':'🔴' };
const SIZE_LIST = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const ALLERGEN_KEYS = ['gluten', 'lactose', 'ovos', 'frutosSecos', 'marisco', 'peixe', 'soja', 'mostarda'];
const ALLERGEN_ICONS = { gluten:'🌾', lactose:'🥛', ovos:'🥚', frutosSecos:'🥜', marisco:'🦐', peixe:'🐟', soja:'🫘', mostarda:'🌭' };
const ALLERGEN_NAMES = {
  pt: { gluten:'Glúten', lactose:'Lactose', ovos:'Ovos', frutosSecos:'Frutos secos', marisco:'Marisco', peixe:'Peixe', soja:'Soja', mostarda:'Mostarda' },
  en: { gluten:'Gluten', lactose:'Dairy', ovos:'Eggs', frutosSecos:'Nuts', marisco:'Shellfish', peixe:'Fish', soja:'Soy', mostarda:'Mustard' },
  fr: { gluten:'Gluten', lactose:'Lactose', ovos:'Œufs', frutosSecos:'Fruits à coque', marisco:'Crustacés', peixe:'Poisson', soja:'Soja', mostarda:'Moutarde' },
  es: { gluten:'Gluten', lactose:'Lactosa', ovos:'Huevos', frutosSecos:'Frutos secos', marisco:'Marisco', peixe:'Pescado', soja:'Soja', mostarda:'Mostaza' },
  de: { gluten:'Gluten', lactose:'Laktose', ovos:'Eier', frutosSecos:'Nüsse', marisco:'Krebstiere', peixe:'Fisch', soja:'Soja', mostarda:'Senf' },
  it: { gluten:'Glutine', lactose:'Lattosio', ovos:'Uova', frutosSecos:'Frutta a guscio', marisco:'Crostacei', peixe:'Pesce', soja:'Soia', mostarda:'Senape' }
};
function specsLine() {
  const parts = (state.spec || []).filter(s => s.value).map(s => (s.label ? s.label + ': ' : '') + s.value);
  const t = I18N[state.lang] || I18N.pt;
  if (state.category === 'imoveis' && state.energyRating) {
    parts.push((ENERGY_EMOJI[state.energyRating] || '') + ' ' + t.energyClassLabel + ' ' + state.energyRating);
  }
  if (state.category === 'viagens' && state.starRating > 0) {
    parts.push('★'.repeat(state.starRating) + '☆'.repeat(5 - state.starRating));
  }
  if (state.category === 'gastronomia' && state.allergens.length) {
    parts.push(state.allergens.map(a => ALLERGEN_ICONS[a] || '').join(' '));
  }
  if (state.category === 'moda' && state.sizes.length) {
    parts.push(t.sizesLabel + ' ' + state.sizes.join('/'));
  }
  return parts.join('   ·   ');
}
function onSpecChange(idx, value) {
  state.spec[idx].value = value;
  if (idx === 0) renderCategoryExtras(); // área interior é o campo 0 — recalcula €/m² ao vivo
  draw();
  scheduleSaveDraft();
}
function onSpecLabelChange(idx, value) {
  state.spec[idx].label = value;
  draw();
  scheduleSaveDraft();
}
// Presets por idioma — a categoria escolhida preenche os rótulos na língua ativa,
// mas continuam 100% editáveis. Trocar o idioma da interface depois de escolher a
// categoria não reescreve o que já foi personalizado (só uma nova escolha o faz).
const CATEGORY_PRESETS = {
  pt: {
    generico:  ['Característica 1', 'Característica 2', 'Característica 3', 'Característica 4'],
    imoveis:   ['Área interior (m²)', 'Quartos', 'Área exterior (m²)', 'Lugares de garagem'],
    carros:    ['Marca / Modelo', 'Ano', 'Quilómetros', 'Combustível'],
    viagens:   ['Destino', 'Duração', 'Datas', 'Regime'],
    moda:      ['Tamanho', 'Cor', 'Material', 'Marca'],
    cosmetica: ['Tipo / Uso', 'Volume', 'Ingrediente-chave', 'Marca'],
    casa:      ['Tipo de peça', 'Material', 'Dimensões', 'Marca'],
    gastronomia: ['Tipo de cozinha', 'Porção', 'Ingredientes-chave', 'Restrições'],
    desporto: ['Modalidade', 'Duração', 'Nível', 'Inclui'],
    servicos: ['Especialidade', 'Experiência', 'Disponibilidade', 'Modalidade'],
    eventos: ['Tipo de evento', 'Data', 'Local', 'Capacidade']
  },
  en: {
    generico:  ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4'],
    imoveis:   ['Interior area (m²)', 'Bedrooms', 'Outdoor area (m²)', 'Parking spaces'],
    carros:    ['Make / Model', 'Year', 'Mileage', 'Fuel type'],
    viagens:   ['Destination', 'Duration', 'Dates', 'Board basis'],
    moda:      ['Size', 'Colour', 'Material', 'Brand'],
    cosmetica: ['Type / Use', 'Volume', 'Key ingredient', 'Brand'],
    casa:      ['Item type', 'Material', 'Dimensions', 'Brand'],
    gastronomia: ['Cuisine type', 'Serves', 'Key ingredients', 'Dietary info'],
    desporto: ['Activity type', 'Duration', 'Level', 'Includes'],
    servicos: ['Specialty', 'Experience', 'Availability', 'Format'],
    eventos: ['Event type', 'Date', 'Venue', 'Capacity']
  },
  fr: {
    generico:  ['Caractéristique 1', 'Caractéristique 2', 'Caractéristique 3', 'Caractéristique 4'],
    imoveis:   ['Surface intérieure (m²)', 'Chambres', 'Surface extérieure (m²)', 'Places de parking'],
    carros:    ['Marque / Modèle', 'Année', 'Kilométrage', 'Carburant'],
    viagens:   ['Destination', 'Durée', 'Dates', 'Formule'],
    moda:      ['Taille', 'Couleur', 'Matière', 'Marque'],
    cosmetica: ['Type / Usage', 'Volume', 'Ingrédient clé', 'Marque'],
    casa:      ['Type de pièce', 'Matière', 'Dimensions', 'Marque'],
    gastronomia: ['Type de cuisine', 'Portion', 'Ingrédients clés', 'Régimes spéciaux'],
    desporto: ['Type d\u2019activité', 'Durée', 'Niveau', 'Inclus'],
    servicos: ['Spécialité', 'Expérience', 'Disponibilité', 'Format'],
    eventos: ['Type d\u2019événement', 'Date', 'Lieu', 'Capacité']
  },
  es: {
    generico:  ['Característica 1', 'Característica 2', 'Característica 3', 'Característica 4'],
    imoveis:   ['Superficie interior (m²)', 'Habitaciones', 'Superficie exterior (m²)', 'Plazas de garaje'],
    carros:    ['Marca / Modelo', 'Año', 'Kilómetros', 'Combustible'],
    viagens:   ['Destino', 'Duración', 'Fechas', 'Régimen'],
    moda:      ['Talla', 'Color', 'Material', 'Marca'],
    cosmetica: ['Tipo / Uso', 'Volumen', 'Ingrediente clave', 'Marca'],
    casa:      ['Tipo de pieza', 'Material', 'Dimensiones', 'Marca'],
    gastronomia: ['Tipo de cocina', 'Ración', 'Ingredientes clave', 'Información dietética'],
    desporto: ['Tipo de actividad', 'Duración', 'Nivel', 'Incluye'],
    servicos: ['Especialidad', 'Experiencia', 'Disponibilidad', 'Modalidad'],
    eventos: ['Tipo de evento', 'Fecha', 'Lugar', 'Capacidad']
  },
  de: {
    generico:  ['Merkmal 1', 'Merkmal 2', 'Merkmal 3', 'Merkmal 4'],
    imoveis:   ['Wohnfläche (m²)', 'Zimmer', 'Außenfläche (m²)', 'Stellplätze'],
    carros:    ['Marke / Modell', 'Baujahr', 'Kilometerstand', 'Kraftstoff'],
    viagens:   ['Reiseziel', 'Dauer', 'Termine', 'Verpflegung'],
    moda:      ['Größe', 'Farbe', 'Material', 'Marke'],
    cosmetica: ['Typ / Anwendung', 'Volumen', 'Hauptinhaltsstoff', 'Marke'],
    casa:      ['Art des Stücks', 'Material', 'Maße', 'Marke'],
    gastronomia: ['Küchenstil', 'Portion', 'Hauptzutaten', 'Ernährungshinweise'],
    desporto: ['Aktivitätsart', 'Dauer', 'Niveau', 'Enthält'],
    servicos: ['Spezialgebiet', 'Erfahrung', 'Verfügbarkeit', 'Format'],
    eventos: ['Veranstaltungsart', 'Datum', 'Ort', 'Kapazität']
  },
  it: {
    generico:  ['Caratteristica 1', 'Caratteristica 2', 'Caratteristica 3', 'Caratteristica 4'],
    imoveis:   ['Superficie interna (m²)', 'Camere', 'Superficie esterna (m²)', 'Posti auto'],
    carros:    ['Marca / Modello', 'Anno', 'Chilometraggio', 'Alimentazione'],
    viagens:   ['Destinazione', 'Durata', 'Date', 'Trattamento'],
    moda:      ['Taglia', 'Colore', 'Materiale', 'Marca'],
    cosmetica: ['Tipo / Uso', 'Volume', 'Ingrediente chiave', 'Marca'],
    casa:      ['Tipo di pezzo', 'Materiale', 'Dimensioni', 'Marca'],
    gastronomia: ['Tipo di cucina', 'Porzione', 'Ingredienti chiave', 'Info alimentari'],
    desporto: ['Tipo di attività', 'Durata', 'Livello', 'Include'],
    servicos: ['Specialità', 'Esperienza', 'Disponibilità', 'Modalità'],
    eventos: ['Tipo di evento', 'Data', 'Luogo', 'Capienza']
  }
};
// Paleta sugerida por categoria — poupa o clique de escolher cor à mão.
// Só se aplica enquanto a pessoa não tiver personalizado a cor/fundo ela
// própria (ver state._styleCustomized) — a automação nunca pisa uma escolha
// manual já feita.
const CATEGORY_PALETTES = {
  generico:    { accent: '#B8935A', bg: 'dark'  },
  imoveis:     { accent: '#B8935A', bg: 'dark'  },
  carros:      { accent: '#6B8CAE', bg: 'dark'  },
  viagens:     { accent: '#D97A4D', bg: 'grad'  },
  moda:        { accent: '#A67C87', bg: 'light' },
  cosmetica:   { accent: '#C98BA0', bg: 'light' },
  casa:        { accent: '#7A8B5E', bg: 'light' },
  gastronomia: { accent: '#B5502E', bg: 'dark'  },
  desporto:    { accent: '#D9583A', bg: 'dark'  },
  servicos:    { accent: '#4A6B8A', bg: 'light' },
  eventos:     { accent: '#9B4F8A', bg: 'grad'  }
};
// Selos sugeridos por categoria — um clique preenche o campo "Selo", em vez de
// escrever de raiz. Continua 100% editável a seguir.
const CATEGORY_BADGES = {
  pt: {
    generico:    ['Novo', 'Promoção', 'Exclusivo', 'Limitado'],
    imoveis:     ['Novo no Mercado', 'Reservado', 'Venda Urgente', 'Oportunidade'],
    carros:      ['Garantia Incluída', 'Único Dono', 'Sem Acidentes', 'Revisões em Dia'],
    viagens:     ['Últimas Vagas', 'Oferta Especial', 'Só Este Mês', 'Lotação Limitada'],
    moda:        ['Novo', 'Saldo', 'Edição Limitada', 'Últimas Peças'],
    cosmetica:   ['Novo', 'Mais Vendido', 'Edição Limitada', 'Promoção'],
    casa:        ['Novo', 'Peça Única', 'Em Stock', 'Promoção'],
    gastronomia: ['Prato do Dia', 'Novo no Menu', 'Edição Especial', 'Só Hoje'],
    desporto:    ['Nova Turma', 'Vagas Limitadas', 'Primeira Aula Grátis', 'Inscrições Abertas'],
    servicos:    ['Consulta Gratuita', 'Disponível Já', 'Novo Serviço', 'Vagas Limitadas'],
    eventos:     ['Últimas Vagas', 'Reserva Já', 'Evento Especial', 'Compra Antecipada']
  },
  en: {
    generico:    ['New', 'Sale', 'Exclusive', 'Limited'],
    imoveis:     ['New Listing', 'Under Offer', 'Quick Sale', 'Great Opportunity'],
    carros:      ['Warranty Included', 'One Owner', 'Accident-Free', 'Full Service History'],
    viagens:     ['Last Spots', 'Special Offer', 'This Month Only', 'Limited Availability'],
    moda:        ['New', 'Sale', 'Limited Edition', 'Last Pieces'],
    cosmetica:   ['New', 'Best Seller', 'Limited Edition', 'Sale'],
    casa:        ['New', 'One of a Kind', 'In Stock', 'Sale'],
    gastronomia: ['Dish of the Day', 'New on the Menu', 'Special Edition', 'Today Only'],
    desporto:    ['New Class', 'Limited Spots', 'Free First Class', 'Registration Open'],
    servicos:    ['Free Consultation', 'Available Now', 'New Service', 'Limited Availability'],
    eventos:     ['Last Spots', 'Book Now', 'Special Event', 'Early Bird']
  },
  fr: {
    generico:    ['Nouveau', 'Promotion', 'Exclusif', 'Édition limitée'],
    imoveis:     ['Nouveau sur le marché', 'Sous offre', 'Vente urgente', 'Belle opportunité'],
    carros:      ['Garantie incluse', 'Un seul propriétaire', 'Sans accident', 'Entretien à jour'],
    viagens:     ['Dernières places', 'Offre spéciale', 'Ce mois-ci seulement', 'Places limitées'],
    moda:        ['Nouveau', 'Soldes', 'Édition limitée', 'Dernières pièces'],
    cosmetica:   ['Nouveau', 'Meilleure vente', 'Édition limitée', 'Promotion'],
    casa:        ['Nouveau', 'Pièce unique', 'En stock', 'Promotion'],
    gastronomia: ['Plat du jour', 'Nouveau au menu', 'Édition spéciale', 'Aujourd\u2019hui seulement'],
    desporto:    ['Nouveau cours', 'Places limitées', 'Premier cours gratuit', 'Inscriptions ouvertes'],
    servicos:    ['Consultation gratuite', 'Disponible maintenant', 'Nouveau service', 'Places limitées'],
    eventos:     ['Dernières places', 'Réserver maintenant', 'Événement spécial', 'Tarif anticipé']
  },
  es: {
    generico:    ['Nuevo', 'Oferta', 'Exclusivo', 'Edición limitada'],
    imoveis:     ['Nuevo en el mercado', 'Reservado', 'Venta urgente', 'Gran oportunidad'],
    carros:      ['Garantía incluida', 'Único dueño', 'Sin accidentes', 'Revisiones al día'],
    viagens:     ['Últimas plazas', 'Oferta especial', 'Solo este mes', 'Plazas limitadas'],
    moda:        ['Nuevo', 'Rebajas', 'Edición limitada', 'Últimas piezas'],
    cosmetica:   ['Nuevo', 'Más vendido', 'Edición limitada', 'Oferta'],
    casa:        ['Nuevo', 'Pieza única', 'En stock', 'Oferta'],
    gastronomia: ['Plato del día', 'Nuevo en el menú', 'Edición especial', 'Solo hoy'],
    desporto:    ['Nueva Clase', 'Plazas Limitadas', 'Primera Clase Gratis', 'Inscripciones Abiertas'],
    servicos:    ['Consulta Gratuita', 'Disponible Ya', 'Nuevo Servicio', 'Plazas Limitadas'],
    eventos:     ['Últimas Plazas', 'Reserva Ya', 'Evento Especial', 'Compra Anticipada']
  },
  de: {
    generico:    ['Neu', 'Angebot', 'Exklusiv', 'Limitiert'],
    imoveis:     ['Neu auf dem Markt', 'Reserviert', 'Dringender Verkauf', 'Tolle Gelegenheit'],
    carros:      ['Garantie inklusive', 'Einzelbesitzer', 'Unfallfrei', 'Scheckheftgepflegt'],
    viagens:     ['Letzte Plätze', 'Sonderangebot', 'Nur diesen Monat', 'Begrenzte Plätze'],
    moda:        ['Neu', 'Sale', 'Limitierte Auflage', 'Letzte Stücke'],
    cosmetica:   ['Neu', 'Bestseller', 'Limitierte Auflage', 'Angebot'],
    casa:        ['Neu', 'Unikat', 'Auf Lager', 'Angebot'],
    gastronomia: ['Tagesgericht', 'Neu auf der Karte', 'Sonderedition', 'Nur heute'],
    desporto:    ['Neuer Kurs', 'Begrenzte Plätze', 'Erste Stunde Gratis', 'Anmeldung Offen'],
    servicos:    ['Kostenlose Beratung', 'Jetzt Verfügbar', 'Neuer Service', 'Begrenzte Verfügbarkeit'],
    eventos:     ['Letzte Plätze', 'Jetzt Buchen', 'Besonderes Event', 'Frühbucherpreis']
  },
  it: {
    generico:    ['Nuovo', 'Promozione', 'Esclusivo', 'Edizione limitata'],
    imoveis:     ['Nuovo sul mercato', 'Riservato', 'Vendita urgente', 'Ottima occasione'],
    carros:      ['Garanzia inclusa', 'Unico proprietario', 'Senza incidenti', 'Tagliandi in regola'],
    viagens:     ['Ultimi posti', 'Offerta speciale', 'Solo questo mese', 'Posti limitati'],
    moda:        ['Nuovo', 'Saldi', 'Edizione limitata', 'Ultimi pezzi'],
    cosmetica:   ['Nuovo', 'Più venduto', 'Edizione limitata', 'Promozione'],
    casa:        ['Nuovo', 'Pezzo unico', 'Disponibile', 'Promozione'],
    gastronomia: ['Piatto del giorno', 'Novità nel menu', 'Edizione speciale', 'Solo oggi'],
    desporto:    ['Nuovo Corso', 'Posti Limitati', 'Prima Lezione Gratis', 'Iscrizioni Aperte'],
    servicos:    ['Consulenza Gratuita', 'Disponibile Ora', 'Nuovo Servizio', 'Posti Limitati'],
    eventos:     ['Ultimi Posti', 'Prenota Ora', 'Evento Speciale', 'Prevendita']
  }
};