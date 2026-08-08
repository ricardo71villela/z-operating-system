import type {
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

export const bmwI5G60OfficialVariants:
  ManufacturerOfficialRecord[] = [
    {
      externalId: "BMW-I5-G60-EDRIVE40-SEDAN-EU",
      externalParentId: "BMW-I5-G60",

      entityType: "variant",

      name: "BMW i5 eDrive40",
      manufacturer: "BMW Group",
      brand: "BMW",

      countryCode: "DE",
      marketCode: "EU",

      model: "i5",
      generation: "G60 / G61",
      variant: "i5 eDrive40",
      bodyStyle: "saloon",
      modelYear: 2024,

      officialUrl:
        "https://www.press.bmwgroup.com/global/article/detail/T0416261EN/the-new-bmw-5-series-sedan",

      documentType: "press_kit",

      legalReviewRequired: true,
      automaticPublicationAllowed: false,

      technicalData: {
        power_kw: 250,
        power_hp: 340,
        torque_nm: 430,

        acceleration_0_100_seconds: 6.0,
        top_speed_kmh: 193,

        fuel_type: "electric",
        drivetrain: "RWD",
        transmission: "Single-speed electric",

        consumption_wltp_kwh_100km_min: 15.9,
        consumption_wltp_kwh_100km_max: 18.9,
      },

      metadata: {
        catalogue: "BMW i5 G60",
        source_kind: "manufacturer_official",
        publisher: "BMW Group",
      },
    },

    {
      externalId: "BMW-I5-G60-M60-XDRIVE-SEDAN-EU",
      externalParentId: "BMW-I5-G60",

      entityType: "variant",

      name: "BMW i5 M60 xDrive",
      manufacturer: "BMW Group",
      brand: "BMW",

      countryCode: "DE",
      marketCode: "EU",

      model: "i5",
      generation: "G60 / G61",
      variant: "i5 M60 xDrive",
      bodyStyle: "saloon",
      modelYear: 2024,

      officialUrl:
        "https://www.press.bmwgroup.com/global/article/detail/T0416261EN/the-new-bmw-5-series-sedan",

      documentType: "press_kit",

      legalReviewRequired: true,
      automaticPublicationAllowed: false,

      technicalData: {
        power_kw: 442,
        power_hp: 601,
        torque_nm: 820,

        acceleration_0_100_seconds: 3.8,
        top_speed_kmh: 230,

        fuel_type: "electric",
        drivetrain: "xDrive AWD",
        transmission: "Single-speed electric",

        electric_motor_count: 2,

        consumption_wltp_kwh_100km_min: 18.2,
        consumption_wltp_kwh_100km_max: 20.6,

        electric_range_wltp_km_min: 455,
        electric_range_wltp_km_max: 516,
      },

      metadata: {
        catalogue: "BMW i5 G60",
        source_kind: "manufacturer_official",
        publisher: "BMW Group",
      },
    },
  ];