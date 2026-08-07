export type CuratedGeneration = {
  brandSlug: string;
  modelSlug: string;
  name: string;
  generationCode?: string;
  platformCode?: string;
  productionStart?: string;
  productionEnd?: string;
  modelYearStart?: number;
  modelYearEnd?: number;
  facelift?: boolean;
};

export const curatedGenerations: CuratedGeneration[] = [
  // =========================================================
  // PORSCHE
  // =========================================================

  {
    brandSlug: "porsche",
    modelSlug: "911",
    name: "992.1",
    generationCode: "992.1",
    platformCode: "992",
    productionStart: "2018-01-01",
    productionEnd: "2024-12-31",
    modelYearStart: 2019,
    modelYearEnd: 2024,
  },
  {
    brandSlug: "porsche",
    modelSlug: "911",
    name: "992.2",
    generationCode: "992.2",
    platformCode: "992",
    productionStart: "2024-01-01",
    modelYearStart: 2025,
    facelift: true,
  },
  {
    brandSlug: "porsche",
    modelSlug: "718",
    name: "982",
    generationCode: "982",
    platformCode: "982",
    productionStart: "2016-01-01",
    modelYearStart: 2017,
  },
  {
    brandSlug: "porsche",
    modelSlug: "taycan",
    name: "J1 I",
    generationCode: "Y1A",
    platformCode: "J1",
    productionStart: "2019-01-01",
    productionEnd: "2024-12-31",
    modelYearStart: 2020,
    modelYearEnd: 2024,
  },
  {
    brandSlug: "porsche",
    modelSlug: "taycan",
    name: "J1 Facelift",
    generationCode: "Y1A Facelift",
    platformCode: "J1",
    productionStart: "2024-01-01",
    modelYearStart: 2025,
    facelift: true,
  },
  {
    brandSlug: "porsche",
    modelSlug: "panamera",
    name: "G3",
    generationCode: "976",
    platformCode: "MSB",
    productionStart: "2023-01-01",
    modelYearStart: 2024,
  },
  {
    brandSlug: "porsche",
    modelSlug: "macan",
    name: "Macan II",
    generationCode: "XAB",
    platformCode: "PPE",
    productionStart: "2024-01-01",
    modelYearStart: 2024,
  },
  {
    brandSlug: "porsche",
    modelSlug: "cayenne",
    name: "E3 II",
    generationCode: "9Y0 Facelift",
    platformCode: "MLB Evo",
    productionStart: "2023-01-01",
    modelYearStart: 2024,
    facelift: true,
  },

  // =========================================================
  // BMW
  // =========================================================

  {
    brandSlug: "bmw",
    modelSlug: "3-series",
    name: "G20 / G21",
    generationCode: "G20",
    platformCode: "CLAR",
    productionStart: "2018-01-01",
    modelYearStart: 2019,
  },
  {
    brandSlug: "bmw",
    modelSlug: "4-series",
    name: "G22 / G23 / G26",
    generationCode: "G22",
    platformCode: "CLAR",
    productionStart: "2020-01-01",
    modelYearStart: 2021,
  },
  {
    brandSlug: "bmw",
    modelSlug: "5-series",
    name: "G60 / G61",
    generationCode: "G60",
    platformCode: "CLAR",
    productionStart: "2023-01-01",
    modelYearStart: 2024,
  },
  {
    brandSlug: "bmw",
    modelSlug: "7-series",
    name: "G70",
    generationCode: "G70",
    platformCode: "CLAR",
    productionStart: "2022-01-01",
    modelYearStart: 2023,
  },
  {
    brandSlug: "bmw",
    modelSlug: "x5",
    name: "G05",
    generationCode: "G05",
    platformCode: "CLAR",
    productionStart: "2018-01-01",
    modelYearStart: 2019,
  },
  {
    brandSlug: "bmw",
    modelSlug: "x7",
    name: "G07",
    generationCode: "G07",
    platformCode: "CLAR",
    productionStart: "2018-01-01",
    modelYearStart: 2019,
  },

  // =========================================================
  // MERCEDES-BENZ
  // =========================================================

  {
    brandSlug: "mercedes-benz",
    modelSlug: "c-class",
    name: "W206",
    generationCode: "W206",
    platformCode: "MRA II",
    productionStart: "2021-01-01",
    modelYearStart: 2022,
  },
  {
    brandSlug: "mercedes-benz",
    modelSlug: "e-class",
    name: "W214",
    generationCode: "W214",
    platformCode: "MRA II",
    productionStart: "2023-01-01",
    modelYearStart: 2024,
  },
  {
    brandSlug: "mercedes-benz",
    modelSlug: "s-class",
    name: "W223",
    generationCode: "W223",
    platformCode: "MRA II",
    productionStart: "2020-01-01",
    modelYearStart: 2021,
  },
  {
    brandSlug: "mercedes-benz",
    modelSlug: "gle",
    name: "V167",
    generationCode: "V167",
    platformCode: "MHA",
    productionStart: "2018-01-01",
    modelYearStart: 2019,
  },
  {
    brandSlug: "mercedes-benz",
    modelSlug: "g-class",
    name: "W465",
    generationCode: "W465",
    platformCode: "G-Class",
    productionStart: "2024-01-01",
    modelYearStart: 2025,
    facelift: true,
  },

  // =========================================================
  // AUDI
  // =========================================================

  {
    brandSlug: "audi",
    modelSlug: "a5",
    name: "B10",
    generationCode: "B10",
    platformCode: "PPC",
    productionStart: "2024-01-01",
    modelYearStart: 2025,
  },
  {
    brandSlug: "audi",
    modelSlug: "a6",
    name: "C8",
    generationCode: "C8",
    platformCode: "MLB Evo",
    productionStart: "2018-01-01",
    modelYearStart: 2019,
  },
  {
    brandSlug: "audi",
    modelSlug: "q8",
    name: "4M8",
    generationCode: "4M8",
    platformCode: "MLB Evo",
    productionStart: "2018-01-01",
    modelYearStart: 2019,
  },
  {
    brandSlug: "audi",
    modelSlug: "e-tron-gt",
    name: "J1",
    generationCode: "FW",
    platformCode: "J1",
    productionStart: "2021-01-01",
    modelYearStart: 2022,
  },
  {
    brandSlug: "audi",
    modelSlug: "q6-e-tron",
    name: "GU",
    generationCode: "GU",
    platformCode: "PPE",
    productionStart: "2024-01-01",
    modelYearStart: 2025,
  },
];