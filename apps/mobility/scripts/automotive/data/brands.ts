export type MarketSegment =
  | "mainstream"
  | "premium"
  | "luxury"
  | "sports"
  | "supercar"
  | "hypercar"
  | "commercial"
  | "specialist"
  | "historic";

export type CuratedBrand = {
  name: string;
  manufacturerSlug?: string;
  countryCode: string;
  segment: MarketSegment;
  electric?: boolean;
  historic?: boolean;
  aliases?: string[];
};

export const curatedBrands: CuratedBrand[] = [
  {
    name: "Abarth",
    manufacturerSlug: "stellantis",
    countryCode: "IT",
    segment: "sports",
  },
  {
    name: "Alfa Romeo",
    manufacturerSlug: "stellantis",
    countryCode: "IT",
    segment: "premium",
    aliases: ["Alfa"],
  },
  {
    name: "Alpine",
    manufacturerSlug: "renault-group",
    countryCode: "FR",
    segment: "sports",
  },
  {
    name: "Aston Martin",
    manufacturerSlug: "aston-martin",
    countryCode: "GB",
    segment: "luxury",
  },
  {
    name: "Audi",
    manufacturerSlug: "volkswagen-group",
    countryCode: "DE",
    segment: "premium",
  },
  {
    name: "Bentley",
    manufacturerSlug: "volkswagen-group",
    countryCode: "GB",
    segment: "luxury",
  },
  {
    name: "BMW",
    manufacturerSlug: "bmw-group",
    countryCode: "DE",
    segment: "premium",
    aliases: ["BMW AG", "B.M.W."],
  },
  {
    name: "Bugatti",
    manufacturerSlug: "rimac-group",
    countryCode: "FR",
    segment: "hypercar",
  },
  {
    name: "BYD",
    manufacturerSlug: "byd-company",
    countryCode: "CN",
    segment: "mainstream",
    electric: true,
  },
  {
    name: "Cadillac",
    manufacturerSlug: "general-motors",
    countryCode: "US",
    segment: "premium",
  },
  {
    name: "Chevrolet",
    manufacturerSlug: "general-motors",
    countryCode: "US",
    segment: "mainstream",
    aliases: ["Chevy"],
  },
  {
    name: "Citroën",
    manufacturerSlug: "stellantis",
    countryCode: "FR",
    segment: "mainstream",
    aliases: ["Citroen"],
  },
  {
    name: "CUPRA",
    manufacturerSlug: "volkswagen-group",
    countryCode: "ES",
    segment: "premium",
    aliases: ["Cupra"],
  },
  {
    name: "Dacia",
    manufacturerSlug: "renault-group",
    countryCode: "RO",
    segment: "mainstream",
  },
  {
    name: "DS Automobiles",
    manufacturerSlug: "stellantis",
    countryCode: "FR",
    segment: "premium",
    aliases: ["DS"],
  },
  {
    name: "Ferrari",
    manufacturerSlug: "ferrari",
    countryCode: "IT",
    segment: "supercar",
  },
  {
    name: "Fiat",
    manufacturerSlug: "stellantis",
    countryCode: "IT",
    segment: "mainstream",
  },
  {
    name: "Ford",
    manufacturerSlug: "ford-motor-company",
    countryCode: "US",
    segment: "mainstream",
  },
  {
    name: "Genesis",
    manufacturerSlug: "hyundai-motor-group",
    countryCode: "KR",
    segment: "premium",
  },
  {
    name: "Honda",
    manufacturerSlug: "honda-motor-company",
    countryCode: "JP",
    segment: "mainstream",
  },
  {
    name: "Hyundai",
    manufacturerSlug: "hyundai-motor-group",
    countryCode: "KR",
    segment: "mainstream",
  },
  {
    name: "Jaguar",
    countryCode: "GB",
    segment: "premium",
  },
  {
    name: "Jeep",
    manufacturerSlug: "stellantis",
    countryCode: "US",
    segment: "mainstream",
  },
  {
    name: "Kia",
    manufacturerSlug: "hyundai-motor-group",
    countryCode: "KR",
    segment: "mainstream",
  },
  {
    name: "Koenigsegg",
    manufacturerSlug: "koenigsegg-automotive",
    countryCode: "SE",
    segment: "hypercar",
  },
  {
    name: "Lamborghini",
    manufacturerSlug: "volkswagen-group",
    countryCode: "IT",
    segment: "supercar",
  },
  {
    name: "Land Rover",
    countryCode: "GB",
    segment: "premium",
    aliases: ["Range Rover"],
  },
  {
    name: "Lexus",
    manufacturerSlug: "toyota-motor-corporation",
    countryCode: "JP",
    segment: "premium",
  },
  {
    name: "Lotus",
    manufacturerSlug: "geely-holding",
    countryCode: "GB",
    segment: "sports",
  },
  {
    name: "Lucid",
    countryCode: "US",
    segment: "luxury",
    electric: true,
  },
  {
    name: "Maserati",
    manufacturerSlug: "stellantis",
    countryCode: "IT",
    segment: "luxury",
  },
  {
    name: "Mazda",
    manufacturerSlug: "mazda-motor-corporation",
    countryCode: "JP",
    segment: "mainstream",
  },
  {
    name: "McLaren",
    manufacturerSlug: "mclaren-automotive",
    countryCode: "GB",
    segment: "supercar",
    aliases: ["McLaren Automotive"],
  },
  {
    name: "Mercedes-Benz",
    manufacturerSlug: "mercedes-benz-group",
    countryCode: "DE",
    segment: "premium",
    aliases: [
      "Mercedes",
      "Mercedes Benz",
      "Mercedes-Benz AG",
      "MB",
    ],
  },
  {
    name: "MG",
    manufacturerSlug: "geely-holding",
    countryCode: "GB",
    segment: "mainstream",
    aliases: ["MG Motor"],
  },
  {
    name: "MINI",
    manufacturerSlug: "bmw-group",
    countryCode: "GB",
    segment: "premium",
    aliases: ["Mini"],
  },
  {
    name: "Nissan",
    manufacturerSlug: "nissan-motor-corporation",
    countryCode: "JP",
    segment: "mainstream",
  },
  {
    name: "Opel",
    manufacturerSlug: "stellantis",
    countryCode: "DE",
    segment: "mainstream",
    aliases: ["Vauxhall"],
  },
  {
    name: "Pagani",
    manufacturerSlug: "pagani-automobili",
    countryCode: "IT",
    segment: "hypercar",
  },
  {
    name: "Peugeot",
    manufacturerSlug: "stellantis",
    countryCode: "FR",
    segment: "mainstream",
  },
  {
    name: "Polestar",
    manufacturerSlug: "geely-holding",
    countryCode: "SE",
    segment: "premium",
    electric: true,
  },
  {
    name: "Porsche",
    manufacturerSlug: "porsche-ag",
    countryCode: "DE",
    segment: "sports",
    aliases: [
      "Porsche AG",
      "Dr. Ing. h.c. F. Porsche AG",
    ],
  },
  {
    name: "Renault",
    manufacturerSlug: "renault-group",
    countryCode: "FR",
    segment: "mainstream",
  },
  {
    name: "Rimac",
    manufacturerSlug: "rimac-group",
    countryCode: "HR",
    segment: "hypercar",
    electric: true,
  },
  {
    name: "Rolls-Royce",
    manufacturerSlug: "bmw-group",
    countryCode: "GB",
    segment: "luxury",
    aliases: ["Rolls Royce"],
  },
  {
    name: "SEAT",
    manufacturerSlug: "volkswagen-group",
    countryCode: "ES",
    segment: "mainstream",
    aliases: ["Seat"],
  },
  {
    name: "Škoda",
    manufacturerSlug: "volkswagen-group",
    countryCode: "CZ",
    segment: "mainstream",
    aliases: ["Skoda"],
  },
  {
    name: "Smart",
    manufacturerSlug: "mercedes-benz-group",
    countryCode: "DE",
    segment: "mainstream",
    electric: true,
  },
  {
    name: "Subaru",
    manufacturerSlug: "subaru-corporation",
    countryCode: "JP",
    segment: "mainstream",
  },
  {
    name: "Suzuki",
    manufacturerSlug: "suzuki-motor-corporation",
    countryCode: "JP",
    segment: "mainstream",
  },
  {
    name: "Tesla",
    manufacturerSlug: "tesla-inc",
    countryCode: "US",
    segment: "premium",
    electric: true,
  },
  {
    name: "Toyota",
    manufacturerSlug: "toyota-motor-corporation",
    countryCode: "JP",
    segment: "mainstream",
  },
  {
    name: "Volkswagen",
    manufacturerSlug: "volkswagen-group",
    countryCode: "DE",
    segment: "mainstream",
    aliases: ["VW", "Volkswagen AG"],
  },
  {
    name: "Volvo",
    manufacturerSlug: "geely-holding",
    countryCode: "SE",
    segment: "premium",
  },
  {
    name: "XPENG",
    countryCode: "CN",
    segment: "premium",
    electric: true,
    aliases: ["Xpeng"],
  },
  {
    name: "Zeekr",
    manufacturerSlug: "geely-holding",
    countryCode: "CN",
    segment: "premium",
    electric: true,
  },
];