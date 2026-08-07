export type CuratedModel = {
  brandSlug: string;
  name: string;
  internalCode?: string;
  productionStartYear?: number;
  productionEndYear?: number;
  discontinued?: boolean;
};

export const curatedModels: CuratedModel[] = [
  // Porsche
  {
    brandSlug: "porsche",
    name: "718",
    productionStartYear: 2016,
  },
  {
    brandSlug: "porsche",
    name: "911",
    internalCode: "911",
    productionStartYear: 1964,
  },
  {
    brandSlug: "porsche",
    name: "Taycan",
    productionStartYear: 2019,
  },
  {
    brandSlug: "porsche",
    name: "Panamera",
    productionStartYear: 2009,
  },
  {
    brandSlug: "porsche",
    name: "Macan",
    productionStartYear: 2014,
  },
  {
    brandSlug: "porsche",
    name: "Cayenne",
    productionStartYear: 2002,
  },

  // Ferrari
  {
    brandSlug: "ferrari",
    name: "296",
    productionStartYear: 2022,
  },
  {
    brandSlug: "ferrari",
    name: "Roma",
    productionStartYear: 2020,
  },
  {
    brandSlug: "ferrari",
    name: "Purosangue",
    productionStartYear: 2022,
  },
  {
    brandSlug: "ferrari",
    name: "SF90",
    productionStartYear: 2019,
  },
  {
    brandSlug: "ferrari",
    name: "12Cilindri",
    productionStartYear: 2024,
  },

  // Lamborghini
  {
    brandSlug: "lamborghini",
    name: "Revuelto",
    productionStartYear: 2023,
  },
  {
    brandSlug: "lamborghini",
    name: "Temerario",
    productionStartYear: 2024,
  },
  {
    brandSlug: "lamborghini",
    name: "Urus",
    productionStartYear: 2018,
  },
  {
    brandSlug: "lamborghini",
    name: "Huracán",
    productionStartYear: 2014,
    productionEndYear: 2024,
    discontinued: true,
  },

  // McLaren
  {
    brandSlug: "mclaren",
    name: "Artura",
    productionStartYear: 2021,
  },
  {
    brandSlug: "mclaren",
    name: "750S",
    productionStartYear: 2023,
  },
  {
    brandSlug: "mclaren",
    name: "GTS",
    productionStartYear: 2023,
  },
  {
    brandSlug: "mclaren",
    name: "W1",
    productionStartYear: 2024,
  },

  // Aston Martin
  {
    brandSlug: "aston-martin",
    name: "Vantage",
  },
  {
    brandSlug: "aston-martin",
    name: "DB12",
    productionStartYear: 2023,
  },
  {
    brandSlug: "aston-martin",
    name: "Vanquish",
  },
  {
    brandSlug: "aston-martin",
    name: "DBX",
    productionStartYear: 2020,
  },

  // Bentley
  {
    brandSlug: "bentley",
    name: "Continental GT",
  },
  {
    brandSlug: "bentley",
    name: "Flying Spur",
  },
  {
    brandSlug: "bentley",
    name: "Bentayga",
    productionStartYear: 2015,
  },

  // Rolls-Royce
  {
    brandSlug: "rolls-royce",
    name: "Phantom",
  },
  {
    brandSlug: "rolls-royce",
    name: "Ghost",
  },
  {
    brandSlug: "rolls-royce",
    name: "Cullinan",
    productionStartYear: 2018,
  },
  {
    brandSlug: "rolls-royce",
    name: "Spectre",
    productionStartYear: 2023,
  },

  // BMW
  {
    brandSlug: "bmw",
    name: "2 Series",
  },
  {
    brandSlug: "bmw",
    name: "3 Series",
  },
  {
    brandSlug: "bmw",
    name: "4 Series",
  },
  {
    brandSlug: "bmw",
    name: "5 Series",
  },
  {
    brandSlug: "bmw",
    name: "7 Series",
  },
  {
    brandSlug: "bmw",
    name: "8 Series",
  },
  {
    brandSlug: "bmw",
    name: "X3",
  },
  {
    brandSlug: "bmw",
    name: "X5",
  },
  {
    brandSlug: "bmw",
    name: "X6",
  },
  {
    brandSlug: "bmw",
    name: "X7",
  },
  {
    brandSlug: "bmw",
    name: "XM",
    productionStartYear: 2022,
  },
  {
    brandSlug: "bmw",
    name: "i4",
    productionStartYear: 2021,
  },
  {
    brandSlug: "bmw",
    name: "i5",
    productionStartYear: 2023,
  },
  {
    brandSlug: "bmw",
    name: "i7",
    productionStartYear: 2022,
  },

  // Mercedes-Benz
  {
    brandSlug: "mercedes-benz",
    name: "A-Class",
  },
  {
    brandSlug: "mercedes-benz",
    name: "C-Class",
  },
  {
    brandSlug: "mercedes-benz",
    name: "E-Class",
  },
  {
    brandSlug: "mercedes-benz",
    name: "S-Class",
  },
  {
    brandSlug: "mercedes-benz",
    name: "CLA",
  },
  {
    brandSlug: "mercedes-benz",
    name: "CLE",
    productionStartYear: 2023,
  },
  {
    brandSlug: "mercedes-benz",
    name: "GLC",
  },
  {
    brandSlug: "mercedes-benz",
    name: "GLE",
  },
  {
    brandSlug: "mercedes-benz",
    name: "GLS",
  },
  {
    brandSlug: "mercedes-benz",
    name: "G-Class",
  },
  {
    brandSlug: "mercedes-benz",
    name: "AMG GT",
  },
  {
    brandSlug: "mercedes-benz",
    name: "SL",
  },
  {
    brandSlug: "mercedes-benz",
    name: "EQS",
    productionStartYear: 2021,
  },
  {
    brandSlug: "mercedes-benz",
    name: "EQE",
    productionStartYear: 2022,
  },

  // Audi
  {
    brandSlug: "audi",
    name: "A3",
  },
  {
    brandSlug: "audi",
    name: "A5",
  },
  {
    brandSlug: "audi",
    name: "A6",
  },
  {
    brandSlug: "audi",
    name: "A8",
  },
  {
    brandSlug: "audi",
    name: "Q3",
  },
  {
    brandSlug: "audi",
    name: "Q5",
  },
  {
    brandSlug: "audi",
    name: "Q7",
  },
  {
    brandSlug: "audi",
    name: "Q8",
  },
  {
    brandSlug: "audi",
    name: "e-tron GT",
    productionStartYear: 2021,
  },
  {
    brandSlug: "audi",
    name: "Q6 e-tron",
    productionStartYear: 2024,
  },
];