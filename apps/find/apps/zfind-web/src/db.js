/* ============================================================
   Z FIND — FIXTURE DATA LAYER (Registry / Marketplace / Trust / Data / Intelligence)
   ============================================================
   This is a temporary, product-facing representation of the
   existing Z Operating System architecture:

     Canonical Entity (Registry)
        -> Asset (subtype: apartment / villa / development / land)
        -> Representation (Registry relationship, one Active per Asset)
        -> Listing (Marketplace projection of one Active Representation)
        -> Partner / Company (Registry Entity)
        -> Geography reference (see geography.js — a separate, independent
           bounded context; this file only stores a locationId pointing
           into it, never duplicates place names or hierarchy)
        -> Observations (Data)
        -> Trust presentation fixture (prototype only; no scoring policy)
        -> Intelligence Outputs (Intelligence)
        -> Enquiry policy (Partner-level default, Listing-level override)

   Phase 2.5 refactor notes (approved architecture, see conversation):
   - Listing.category (which conflated "what the asset is" with "how
     it's distributed") is REMOVED. Replaced by:
       Asset.subtype   — Registry-owned, what the asset is
       Listing.channel — Marketplace-owned, how it's distributed
                          ('standard' | 'offmarket')
   - Currency is never hardcoded here. Every price is resolved to its
     Currency via Geography (Asset -> Zone -> City -> Country -> Currency)
     at the view-model layer, not stored per-listing.
   - Enquiry configuration now defaults from Partner.enquiryPolicy;
     Listing.enquiryConfig is present ONLY where it genuinely overrides
     the partner default (cedofeita, land, offmarket) — this is itself
     a live illustration of "override only when necessary."

   Nothing here is a new canonical domain object. This layer only
   *shapes* fixture data the way the real Registry/Marketplace/Data/
   Trust Engine/Intelligence models already require. See
   140-roadmaps/Z-FIND-STRATEGY.md and the domain models under
   20-registry/, 30-trust-engine/, 50-marketplace/, 60-data/,
   80-intelligence/ for the authoritative concepts.
   ============================================================ */

const DB = {

  /* ---------------- PARTNERS (Registry Entity: Company) ---------------- */
  partners: {
    partner_zimob: {
      id:'partner_zimob',
      name:'Z Imobiliária',
      trustId:'trust_zimob',
      avgResponseHours:4.2,
      packageId:'z_find_premium',
      // Default enquiry policy for every Listing this partner represents,
      // unless a specific Listing overrides it (see Listings below).
      enquiryPolicy:{ direct:true, qualified:true, assisted:false },
    },
    // Historical-only partner: proves representation history is preserved
    // even though this partner no longer has an Active representation
    // (or any current listing) on the duplicate-scenario asset below.
    partner_agencyb: {
      id:'partner_agencyb',
      name:'Agency B',
      trustId:null,
      avgResponseHours:null,
      packageId:null,
      enquiryPolicy:{ direct:true, qualified:false, assisted:false },
    },
  },

  /* ---------------- ASSETS (Registry Entity: Property / Development / Land) ----------------
     subtype is Registry-owned classification: 'apartment' | 'villa' | 'development' | 'land'.
     locationId references a Geography Zone (or, for a purely rural
     asset with no zone, could reference a City directly — not needed
     by any current fixture, but geography.js's resolveLocation()
     already supports it). */
  assets: {
    asset_apt_boavista:  { id:'asset_apt_boavista',  kind:'Property',    subtype:'apartment', typology:'T3 Duplex', areaSqm:140, locationId:'zone_boavista' },
    asset_apt_foz:        { id:'asset_apt_foz',        kind:'Property',    subtype:'apartment', typology:'T2',        areaSqm:92,  locationId:'zone_foz' },
    asset_townhouse_cedofeita: { id:'asset_townhouse_cedofeita', kind:'Property', subtype:'villa', typology:'Townhouse', areaSqm:260, locationId:'zone_cedofeita' },
    asset_dev_rionorte:  { id:'asset_dev_rionorte',  kind:'Development', subtype:'development', locationId:'zone_matosinhos_sul', unitIds:['unit_2a','unit_3b','unit_4a','unit_5c','unit_ph1'] },
    unit_2a:  { id:'unit_2a',  kind:'Property', typology:'T1', areaSqm:62,  floor:2, developmentId:'asset_dev_rionorte' },
    unit_3b:  { id:'unit_3b',  kind:'Property', typology:'T2', areaSqm:88,  floor:3, developmentId:'asset_dev_rionorte' },
    unit_4a:  { id:'unit_4a',  kind:'Property', typology:'T2', areaSqm:91,  floor:4, developmentId:'asset_dev_rionorte' },
    unit_5c:  { id:'unit_5c',  kind:'Property', typology:'T3', areaSqm:124, floor:5, developmentId:'asset_dev_rionorte' },
    unit_ph1: { id:'unit_ph1', kind:'Property', typology:'Penthouse', areaSqm:180, floor:6, developmentId:'asset_dev_rionorte' },
    asset_land_boavista: { id:'asset_land_boavista', kind:'Land', subtype:'land', areaSqm:3200, locationId:'zone_boavista' },
    asset_villa_offmarket_foz: { id:'asset_villa_offmarket_foz', kind:'Property', subtype:'villa', typology:'Villa', areaSqm:210, locationId:'zone_foz' },
    // France — first validation country beyond Portugal (see geography.js).
    asset_apt_paris_marais: { id:'asset_apt_paris_marais', kind:'Property', subtype:'apartment', typology:'F2', areaSqm:58, locationId:'zone_le_marais' },
  },

  /* Unit-level status is Marketplace/product state, distinct from Asset identity */
  unitStatus: { unit_2a:'available', unit_3b:'available', unit_4a:'reserved', unit_5c:'available', unit_ph1:'sold' },
  unitPrice:  { unit_2a:340000, unit_3b:465000, unit_4a:478000, unit_5c:612000, unit_ph1:980000 },

  /* ---------------- REPRESENTATIONS (Registry Relationship) ---------------- */
  representations: {
    rep_apt_boavista_active: { id:'rep_apt_boavista_active', assetId:'asset_apt_boavista', partnerId:'partner_zimob', status:'Active', startDate:'2026-04-01' },
    rep_apt_foz_active:      { id:'rep_apt_foz_active',      assetId:'asset_apt_foz',      partnerId:'partner_zimob', status:'Active', startDate:'2026-03-15' },

    rep_cedofeita_ended:  { id:'rep_cedofeita_ended',  assetId:'asset_townhouse_cedofeita', partnerId:'partner_agencyb', status:'Ended',  startDate:'2025-11-01', endDate:'2026-05-10' },
    rep_cedofeita_active: { id:'rep_cedofeita_active', assetId:'asset_townhouse_cedofeita', partnerId:'partner_zimob',   status:'Active', startDate:'2026-05-12' },

    rep_dev_rionorte_active: { id:'rep_dev_rionorte_active', assetId:'asset_dev_rionorte', partnerId:'partner_zimob', status:'Active', startDate:'2026-01-10' },
    rep_land_boavista_active: { id:'rep_land_boavista_active', assetId:'asset_land_boavista', partnerId:'partner_zimob', status:'Active', startDate:'2026-06-01' },
    rep_offmarket_foz_active: { id:'rep_offmarket_foz_active', assetId:'asset_villa_offmarket_foz', partnerId:'partner_zimob', status:'Active', startDate:'2026-06-20' },
    rep_paris_marais_active: { id:'rep_paris_marais_active', assetId:'asset_apt_paris_marais', partnerId:'partner_zimob', status:'Active', startDate:'2026-07-01' },
  },

  /* ---------------- LISTINGS (Marketplace projection of ONE Active Representation) ----------------
     channel: 'standard' | 'offmarket' — Marketplace-owned distribution
     policy, independent of what the Asset is (see Asset.subtype above).
     enquiryConfig is OMITTED unless it genuinely overrides the
     representing Partner's enquiryPolicy. */
  listings: {
    listing_apt_boavista: {
      id:'listing_apt_boavista', representationId:'rep_apt_boavista_active', product:'zfind', state:'Published',
      priceCurrent:620000, channel:'standard',
      relevantTools:['acquisition_cost','mortgage','yield'],
    },
    listing_apt_foz: {
      id:'listing_apt_foz', representationId:'rep_apt_foz_active', product:'zfind', state:'Published',
      priceCurrent:385000, channel:'standard',
      relevantTools:['acquisition_cost','mortgage','yield'],
    },
    listing_cedofeita: {
      id:'listing_cedofeita', representationId:'rep_cedofeita_active', product:'zfind', state:'Published',
      priceCurrent:1180000, channel:'standard',
      enquiryConfig:{ direct:true, qualified:true, assisted:true },
      relevantTools:['acquisition_cost','mortgage','yield'],
    },
    listing_dev_rionorte: {
      id:'listing_dev_rionorte', representationId:'rep_dev_rionorte_active', product:'zfind', state:'Published',
      priceCurrent:340000, priceIsFrom:true, channel:'standard',
      relevantTools:['acquisition_cost','mortgage'],
    },
    listing_land_boavista: {
      id:'listing_land_boavista', representationId:'rep_land_boavista_active', product:'zfind', state:'Published',
      priceCurrent:1450000, channel:'standard',
      enquiryConfig:{ direct:false, qualified:true, assisted:true },
      relevantTools:['development_scenario','construction_cost','revenue_scenario'],
    },
    listing_offmarket_foz: {
      id:'listing_offmarket_foz', representationId:'rep_offmarket_foz_active', product:'zfind', state:'Published',
      priceCurrent:890000, channel:'offmarket',
      enquiryConfig:{ direct:false, qualified:true, assisted:true },
      relevantTools:['acquisition_cost','mortgage'],
    },
    listing_paris_marais: {
      id:'listing_paris_marais', representationId:'rep_paris_marais_active', product:'zfind', state:'Published',
      priceCurrent:495000, channel:'standard',
      relevantTools:['acquisition_cost','mortgage','yield'],
    },
  },

  /* ---------------- LOCALIZED EDITORIAL CONTENT (per asset, per language) ---------------- */
  content: {
    asset_apt_boavista: {
      en:{ title:'T3 Duplex with River View', description:'A duplex apartment on the top two floors of a 2019 development, with open river views from the main living area and both suites. Represented exclusively by one agency — no duplicate listings elsewhere on Z Find.' },
      pt:{ title:'T3 Duplex com Vista Rio', description:'Apartamento duplex nos dois últimos pisos de um empreendimento de 2019, com vista desafogada sobre o rio a partir da sala principal e das duas suítes. Representado em exclusivo por uma agência — sem duplicações noutros pontos do Z Find.' },
      fr:{ title:'T3 Duplex avec Vue sur le Fleuve', description:"Appartement duplex situé aux deux derniers étages d'un immeuble de 2019, avec vue dégagée sur le fleuve depuis le séjour principal et les deux suites. Représenté en exclusivité par une seule agence." },
    },
    asset_apt_foz: {
      en:{ title:'T2 Near the Seafront', description:'A renovated two-bedroom apartment a short walk from Foz do Douro\'s seafront promenade.' },
      pt:{ title:'T2 Perto da Marginal', description:'Apartamento T2 remodelado, a curta distância da marginal da Foz do Douro.' },
      fr:{ title:'T2 Près du Front de Mer', description:"Appartement de deux chambres rénové, à quelques pas de la promenade de Foz do Douro." },
    },
    asset_townhouse_cedofeita: {
      en:{ title:'Restored Townhouse', description:'A fully restored 19th-century townhouse in Cedofeita, with a private garden. One canonical opportunity — its representation changed in May 2026; history is preserved and visible below.' },
      pt:{ title:'Casa Restaurada', description:'Casa do século XIX totalmente restaurada em Cedofeita, com jardim privado. Uma única oportunidade canónica — a sua representação mudou em maio de 2026; o histórico está preservado e visível abaixo.' },
      fr:{ title:'Maison de Ville Restaurée', description:"Maison du XIXe siècle entièrement restaurée à Cedofeita, avec jardin privé. Une seule opportunité canonique — sa représentation a changé en mai 2026." },
    },
    asset_dev_rionorte: {
      en:{ title:'Rio Norte Residences', description:'A waterfront development in Matosinhos Sul, 18 units, currently under construction.' },
      pt:{ title:'Rio Norte Residences', description:'Empreendimento de frente ribeirinha em Matosinhos Sul, 18 unidades, atualmente em construção.' },
      fr:{ title:'Rio Norte Residences', description:"Développement en front d'eau à Matosinhos Sul, 18 unités, actuellement en construction." },
    },
    asset_land_boavista: {
      en:{ title:'Urban Plot — Mixed-Use Potential', description:'A 3,200 m² vacant urban plot in Boavista, former industrial use, with mixed-use zoning under the municipal plan (PDM).' },
      pt:{ title:'Lote Urbano — Potencial Misto', description:'Lote urbano de 3.200 m² devoluto na Boavista, antigo uso industrial, com zonamento misto ao abrigo do PDM.' },
      fr:{ title:'Parcelle Urbaine — Potentiel Mixte', description:"Parcelle urbaine vacante de 3 200 m² à Boavista, ancien usage industriel, avec zonage mixte selon le plan municipal (PDM)." },
    },
    asset_villa_offmarket_foz: {
      en:{ title:'Off-Market Villa Near the Seafront', description:'A 210 m² villa in Foz do Douro, not publicly marketed. Available exclusively through a qualified introduction — the owner has requested discretion.' },
      pt:{ title:'Moradia Off-Market Perto da Marginal', description:'Moradia de 210 m² na Foz do Douro, sem divulgação pública. Disponível exclusivamente através de apresentação qualificada — o proprietário pediu discrição.' },
      fr:{ title:'Villa Hors Marché Près du Front de Mer', description:"Villa de 210 m² à Foz do Douro, non commercialisée publiquement. Disponible exclusivement via une introduction qualifiée — le propriétaire a demandé la discrétion." },
    },
    asset_apt_paris_marais: {
      en:{ title:'Renovated Apartment in Le Marais', description:'A 58 m² renovated two-room apartment (F2) in the heart of Le Marais, close to Place des Vosges. First Z Find opportunity in France.' },
      pt:{ title:'Apartamento Remodelado no Marais', description:'Apartamento remodelado de 58 m² (F2) no coração do Marais, perto da Place des Vosges. Primeira oportunidade Z Find em França.' },
      fr:{ title:'Appartement Rénové dans le Marais', description:'Appartement de deux pièces (F2) de 58 m² entièrement rénové, au cœur du Marais, à proximité de la Place des Vosges. Première opportunité Z Find en France.' },
    },
  },

  /* ---------------- OBSERVATIONS (Data) ---------------- */
  observations: {
    asset_apt_boavista: [
      { metric:'avg_price_sqm_zone', value:4380, unit:'eur_sqm', status:'fact' },
      { metric:'price_sqm_this',     value:4428, unit:'eur_sqm', status:'fact' },
      { metric:'price_trend_12m',    value:6.2,  unit:'pct',     status:'fact' },
      { metric:'comparable_transactions_6m', value:14, unit:'count', status:'fact' },
    ],
    asset_apt_foz: [
      { metric:'avg_price_sqm_zone', value:5120, unit:'eur_sqm', status:'fact' },
      { metric:'price_trend_12m',    value:4.8,  unit:'pct',     status:'fact' },
    ],
    asset_townhouse_cedofeita: [
      { metric:'avg_price_sqm_zone', value:3950, unit:'eur_sqm', status:'fact' },
      { metric:'price_sqm_this',     value:4538, unit:'eur_sqm', status:'fact' },
      { metric:'price_trend_12m',    value:7.4,  unit:'pct',     status:'fact' },
      { metric:'comparable_transactions_6m', value:6, unit:'count', status:'fact' },
    ],
    asset_villa_offmarket_foz: [
      { metric:'avg_price_sqm_zone', value:5120, unit:'eur_sqm', status:'fact' },
      { metric:'price_trend_12m',    value:4.8,  unit:'pct',     status:'fact' },
    ],
    asset_apt_paris_marais: [
      { metric:'avg_price_sqm_zone', value:12800, unit:'eur_sqm', status:'fact' },
      { metric:'price_trend_12m',    value:2.1,   unit:'pct',     status:'fact' },
    ],
  },

  /* ---------------- TRUST PRESENTATION FIXTURE ----------------
     Prototype-only UI data.

     This is NOT an authoritative Trust Score, scoring algorithm or persisted
     Trust Engine projection. Verification truth lives in
     verification_assessments.

     The concrete level/checklist/limitations below exist only so the current
     prototype can render the intended Trust experience until an explicit,
     evidence-backed Trust derivation policy is approved.
     ------------------------------------------------------------- */
  trust: {
    trust_zimob: {
      id:'trust_zimob', level:'high',
      checklist:[
        { key:'identityVerified',   positive:true },
        { key:'documentationVerified', positive:true },
        { key:'consistentHistory',  positive:true },
        { key:'independentCorroboration', positive:true },
      ],
      limitations:[
        { key:'lastVerification', detailMonths:11 },
      ],
    },
  },

  /* ---------------- INTELLIGENCE OUTPUTS (Intelligence) ---------------- */
  intelligence: {
    asset_apt_boavista: {
      yield:{ low:4.1, high:4.6, rentLow:2100, rentHigh:2350, status:'model_output' },
    },
    asset_land_boavista: {
      scenarios:[
        { key:'residential', estGDV:8200000, unitsEst:52, constructionCostEst:5400000, buildMonthsEst:'18–24', status:'model_output' },
        { key:'mixedUse',     estGDV:9600000, description:'ground_floor_retail_40_apts', status:'model_output' },
      ],
    },
  },

  /* ---------------- LAND LAYERED INFORMATION MODEL ---------------- */
  land: {
    asset_land_boavista: {
      knownFacts:[
        { key:'plotArea', value:'3,200 m²', status:'fact' },
        { key:'currentUse', value:'vacant_former_industrial', status:'fact' },
        { key:'zoning', value:'mixed_use_urban', status:'fact' },
        { key:'access', value:'paved_road_utilities_nearby', status:'fact' },
      ],
      planningContext:[
        { key:'estBuildableGBA', value:'6,800 m²', status:'estimate' },
        { key:'estMaxHeight', value:'6_floors', status:'estimate' },
        { key:'pipStatus', value:'not_submitted', status:'fact' },
      ],
    },
  },

  /* ---------------- CONTENT / TOOLS / PROFESSIONALS REFERENCES ---------------- */
  contentRefs: {
    asset_apt_boavista: { locationId:'zone_boavista', relatedGuideIds:['guide_buying_costs_pt'], relevantProfessionalIds:[] },
    asset_land_boavista: { locationId:'zone_boavista', relatedGuideIds:['guide_evaluating_land'], relevantProfessionalIds:['prof_planning_consultant','prof_architect_mixeduse'] },
  },

  /* ---------------- COMMERCIAL PACKAGES (Z Find product layer — not a new domain object) ---------------- */
  packages: {
    z_find_listing:     { id:'z_find_listing',     entitlements:{ maxActiveListings:5,   developmentsEnabled:false, qualificationEnabled:false } },
    z_find_development:{ id:'z_find_development',  entitlements:{ maxActiveListings:20,  developmentsEnabled:true,  qualificationEnabled:false } },
    z_find_qualified:   { id:'z_find_qualified',    entitlements:{ maxActiveListings:20,  developmentsEnabled:true,  qualificationEnabled:true  } },
    z_find_premium:      { id:'z_find_premium',      entitlements:{ maxActiveListings:200, developmentsEnabled:true,  qualificationEnabled:true  } },
  },
};
