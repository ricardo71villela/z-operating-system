/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Pure semantic detectors.
 *
 * No filesystem access.
 * No external services.
 */

import type {
  BodyStyle,
  Drivetrain,
  Electrification,
  FuelType,
  Transmission,
} from "./parser-types";

export type PowerOutput = {
  powerKw: number | null;
  powerPs: number | null;
};

export function detectFuelType(
  text: string,
): FuelType | null {
  if (
    /\be-?hybrid\b|plug[- ]?in hybrid|\bPHEV\b/i.test(
      text,
    )
  ) {
    return "plug_in_hybrid";
  }

  if (
    /\be-?tron\b|battery electric|\bBEV\b|fully electric|\belectric\b|\bel[eé]tric[oa]\b|\bélectrique\b|\belektrisch\b/i.test(
      text,
    )
  ) {
    return "electric";
  }

  if (/\bTDI\b|\bdiesel\b/i.test(text)) {
    return "diesel";
  }

  if (
    /\bTFSI\b|\bTSI\b|\bFSI\b|\bgasoline\b|\bpetrol\b|\bbenzine\b|\bgasolina\b|\bessence\b|\bbenzin\b/i.test(
      text,
    )
  ) {
    return "gasoline";
  }

  if (/\bhybrid\b|\bh[ií]brid[oa]\b|\bhybride\b/i.test(text)) {
    return "hybrid";
  }

  if (/\bhydrogen\b|\bFCEV\b|\bhidrog[eé]nio\b|\bhydrog[eè]ne\b|\bwasserstoff\b/i.test(text)) {
    return "hydrogen";
  }

  return null;
}

export function detectDrivetrain(
  text: string,
): Drivetrain | null {
  const hasFrontWheelDrive =
    /\bfront[- ]wheel drive\b|\bFWD\b|(?:^|[\s|:/])front(?:$|[\s|:/])/i.test(
      text,
    );

  const hasRearWheelDrive =
    /\brear[- ]wheel drive\b|\bRWD\b|(?:^|[\s|:/])rear(?:$|[\s|:/])/i.test(
      text,
    );

  const hasAllWheelDrive =
    /\bquattro\b|\ball[- ]wheel drive\b|\bAWD\b|\b4MATIC\b|\bxDrive\b/i.test(
      text,
    );

  if (hasAllWheelDrive) {
    return "AWD";
  }

  if (hasFrontWheelDrive) {
    return "FWD";
  }

  if (hasRearWheelDrive) {
    return "RWD";
  }

  return null;
}

export function detectTransmission(
  text: string,
): Transmission | null {
  if (
    /\bS tronic\b|\bdual[- ]clutch\b|\bDCT\b|\bDSG\b/i.test(
      text,
    )
  ) {
    return "dual_clutch";
  }

  if (
    /\btiptronic\b|\bautomatic\b|\bautomatic transmission\b|\bautom[aá]tic[oa]\b|\bautomatique\b|\bautomatik\b/i.test(
      text,
    )
  ) {
    return "automatic";
  }

  if (
    /\bmanual\b|\bmanual transmission\b/i.test(
      text,
    )
  ) {
    return "manual";
  }

  return null;
}

export function detectDisplacement(
  text: string,
): number | null {
  const normalized = text.replace(/\s+/g, " ");

  /*
   * Supported examples:
   * 1968 cm³
   * 1,968 cm³
   * 1.968 cm3
   * 1,968 cc
   */
  const cubicCentimetresMatch = normalized.match(
    /(\d{1,2}[.,]\d{3}|\d{3,5})\s*(?:cm³|cm3|cc)\b/i,
  );

  if (cubicCentimetresMatch) {
    return Number(
      cubicCentimetresMatch[1].replace(
        /[.,]/g,
        "",
      ),
    );
  }

  /*
   * Supported examples:
   * 2.0 TDI
   * 3.0 TFSI
   * 4.4 V8
   */
  const litresMatch = normalized.match(
    /\b(\d(?:[.,]\d)?)\b(?=\s*(?:TDI|TFSI|TSI|FSI|V6|V8|V10|V12|I3|I4|I5|I6|Hybrid|Diesel|Petrol|Gasoline)\b)/i,
  );

  if (!litresMatch) {
    return null;
  }

  const litres = Number(
    litresMatch[1].replace(",", "."),
  );

  return Number.isFinite(litres)
    ? Math.round(litres * 1000)
    : null;
}

export function detectBodyStyle(
  text: string,
): BodyStyle | null {
  if (
    /\bAvant\b|\bestate\b|\bwagon\b|\btouring\b/i.test(
      text,
    )
  ) {
    return "Avant";
  }

  if (
    /\bSedan\b|\bsaloon\b|\blimousine\b|\bnotchback\b/i.test(
      text,
    )
  ) {
    return "Sedan";
  }

  if (
    /\bSportback\b|\bliftback\b|\bfastback\b/i.test(
      text,
    )
  ) {
    return "Sportback";
  }

  if (
    /\bSUV\b|\bsport utility vehicle\b/i.test(
      text,
    )
  ) {
    return "SUV";
  }

  if (/\bCoup[eé]\b/i.test(text)) {
    return "Coupe";
  }

  if (
    /\bCabriolet\b|\bconvertible\b/i.test(
      text,
    )
  ) {
    return "Cabriolet";
  }

  if (/\bRoadster\b/i.test(text)) {
    return "Roadster";
  }

  return null;
}

export function detectElectrification(
  text: string,
): Electrification | null {
  if (
    /\be-?hybrid\b|plug[- ]?in hybrid|\bPHEV\b/i.test(
      text,
    )
  ) {
    return "PHEV";
  }

  if (
    /\be-?tron\b|battery electric|\bBEV\b|fully electric|\belectric\b|\bel[eé]tric[oa]\b|\bélectrique\b|\belektrisch\b/i.test(
      text,
    )
  ) {
    return "BEV";
  }

  if (
    /\bMHEV\b|mild[- ]hybrid|48[- ]volt/i.test(
      text,
    )
  ) {
    return "MHEV";
  }

  if (/\bhydrogen\b|\bFCEV\b|\bhidrog[eé]nio\b|\bhydrog[eè]ne\b|\bwasserstoff\b/i.test(text)) {
    return "FCEV";
  }

  if (
    /\bTDI\b|\bTFSI\b|\bTSI\b|\bFSI\b|\bdiesel\b|\bgasoline\b|\bpetrol\b/i.test(
      text,
    )
  ) {
    return "ICE";
  }

  return null;
}

export function detectPowerOutput(
  text: string,
): PowerOutput {
  /*
   * Typical technical table:
   * 150 (204) at 4,300 rpm
   *
   * The first value is interpreted as kW
   * and the parenthesized value as PS.
   */
  const combinedMatch = text.match(
    /\b(\d{2,4}(?:[.,]\d+)?)\s*\(\s*(\d{2,4}(?:[.,]\d+)?)\s*\)/,
  );

  if (combinedMatch) {
    return {
      powerKw: Number(
        combinedMatch[1].replace(",", "."),
      ),
      powerPs: Number(
        combinedMatch[2].replace(",", "."),
      ),
    };
  }

  const kwMatch = text.match(
    /\b(\d{2,4}(?:[.,]\d+)?)\s*kW\b/i,
  );

  const psMatch = text.match(
    /\b(\d{2,4}(?:[.,]\d+)?)\s*(?:PS|hp|cv)\b/i,
  );

  return {
    powerKw: kwMatch
      ? Number(kwMatch[1].replace(",", "."))
      : null,

    powerPs: psMatch
      ? Number(psMatch[1].replace(",", "."))
      : null,
  };
}

export function detectTorque(
  text: string,
): number | null {
  const match = text.match(
    /\b(\d{2,4}(?:[.,]\d+)?)\s*(?:Nm|newton[- ]?meters?|newton[- ]?metres?)\b/i,
  );

  if (!match) {
    return null;
  }

  const torque = Number(
    match[1].replace(",", "."),
  );

  return Number.isFinite(torque)
    ? torque
    : null;
}