export type PorscheOfficialVariantRecord = {
  externalId: string;
  name: string;
  model: string;
  generation: string;
  bodyStyle: "coupe" | "convertible" | "targa";
  marketCode: string;
  modelYear?: number;
  officialUrl: string;
  officialDocumentType:
    | "press_kit"
    | "technical_specification"
    | "model_range";

  powerKw?: number;
  powerPs?: number;
  torqueNm?: number;
  displacementCc?: number;
  acceleration0100Seconds?: number;
  topSpeedKmh?: number;

  fuelType?: string;
  transmission?: string;
  drivetrain?: string;

  legalReviewRequired: true;
};

export const porsche9119922OfficialVariants:
  PorscheOfficialVariantRecord[] = [
    {
      externalId: "PORSCHE-911-9922-CARRERA-GTS-COUPE-EU",
      name: "911 Carrera GTS Coupé",
      model: "911",
      generation: "992.2",
      bodyStyle: "coupe",
      marketCode: "EU",
      modelYear: 2025,

      officialUrl:
        "https://newsroom.porsche.com/en/press-kits/911/Drive-technology--engine-and-gearbox.html",

      officialDocumentType: "technical_specification",

      displacementCc: 3591,
      powerKw: 398,
      powerPs: 541,
      torqueNm: 610,
      acceleration0100Seconds: 3.0,
      topSpeedKmh: 312,

      fuelType: "t_hybrid_petrol",
      transmission: "8-speed PDK",
      drivetrain: "RWD",

      legalReviewRequired: true,
    },

    {
      externalId:
        "PORSCHE-911-9922-CARRERA-GTS-CABRIOLET-EU",
      name: "911 Carrera GTS Cabriolet",
      model: "911",
      generation: "992.2",
      bodyStyle: "convertible",
      marketCode: "EU",
      modelYear: 2025,

      officialUrl:
        "https://newsroom.porsche.com/en_US/model-range/911/911-carrera-GTS-cabriolet.html",

      officialDocumentType: "model_range",

      displacementCc: 3591,
      powerKw: 398,
      powerPs: 541,
      torqueNm: 610,

      fuelType: "t_hybrid_petrol",
      transmission: "8-speed PDK",
      drivetrain: "RWD",

      legalReviewRequired: true,
    },

    {
      externalId: "PORSCHE-911-9922-TURBO-S-COUPE-EU",
      name: "911 Turbo S Coupé",
      model: "911",
      generation: "992.2",
      bodyStyle: "coupe",
      marketCode: "EU",
      modelYear: 2027,

      officialUrl:
        "https://newsroom.porsche.com/en/press-kits/pfv-porsche-911-turbo-s/Summary.html",

      officialDocumentType: "press_kit",

      displacementCc: 3591,
      powerKw: 523,
      powerPs: 711,
      torqueNm: 800,
      acceleration0100Seconds: 2.5,
      topSpeedKmh: 322,

      fuelType: "t_hybrid_petrol",
      transmission: "8-speed PDK",
      drivetrain: "PTM AWD",

      legalReviewRequired: true,
    },

    {
      externalId:
        "PORSCHE-911-9922-TURBO-S-CABRIOLET-EU",
      name: "911 Turbo S Cabriolet",
      model: "911",
      generation: "992.2",
      bodyStyle: "convertible",
      marketCode: "EU",
      modelYear: 2027,

      officialUrl:
        "https://newsroom.porsche.com/en_US/model-range/911.html",

      officialDocumentType: "model_range",

      displacementCc: 3591,
      powerKw: 523,
      powerPs: 711,
      torqueNm: 800,

      fuelType: "t_hybrid_petrol",
      transmission: "8-speed PDK",
      drivetrain: "PTM AWD",

      legalReviewRequired: true,
    },
  ];