import type {
  AutomotiveMetricDefinition,
  AutomotiveMetricKey,
} from "../../../packages/automotive-domain/src";

const DEFINITIONS: Record<string, AutomotiveMetricDefinition> = {
  power_kw: {
    key: "automotive.power.output_kw",
    label: "Power",
    valueType: "number",
    unit: "kW",
  },
  power_hp: {
    key: "automotive.power.output_hp",
    label: "Power",
    valueType: "number",
    unit: "hp",
  },
  power_cv: {
    key: "automotive.power.output_hp",
    label: "Power",
    valueType: "number",
    unit: "hp",
  },
  torque_nm: {
    key: "automotive.power.torque_nm",
    label: "Torque",
    valueType: "number",
    unit: "Nm",
  },
  battery_capacity_kwh: {
    key: "automotive.battery.capacity_kwh",
    label: "Battery capacity",
    valueType: "number",
    unit: "kWh",
  },
  battery_usable_kwh: {
    key: "automotive.battery.usable_kwh",
    label: "Usable battery capacity",
    valueType: "number",
    unit: "kWh",
  },
  range_wltp_km: {
    key: "automotive.range.wltp_km",
    label: "WLTP range",
    valueType: "number",
    unit: "km",
  },
  wltp_range_km: {
    key: "automotive.range.wltp_km",
    label: "WLTP range",
    valueType: "number",
    unit: "km",
  },
  electric_range_km: {
    key: "automotive.range.electric_km",
    label: "Electric range",
    valueType: "number",
    unit: "km",
  },
  top_speed_kmh: {
    key: "automotive.performance.top_speed_kmh",
    label: "Top speed",
    valueType: "number",
    unit: "km/h",
  },
  acceleration_0_100_s: {
    key: "automotive.performance.acceleration_0_100_s",
    label: "0-100 km/h",
    valueType: "number",
    unit: "s",
  },
  weight_kg: {
    key: "automotive.dimensions.weight_kg",
    label: "Weight",
    valueType: "number",
    unit: "kg",
  },
  length_mm: {
    key: "automotive.dimensions.length_mm",
    label: "Length",
    valueType: "number",
    unit: "mm",
  },
  width_mm: {
    key: "automotive.dimensions.width_mm",
    label: "Width",
    valueType: "number",
    unit: "mm",
  },
  height_mm: {
    key: "automotive.dimensions.height_mm",
    label: "Height",
    valueType: "number",
    unit: "mm",
  },
  wheelbase_mm: {
    key: "automotive.dimensions.wheelbase_mm",
    label: "Wheelbase",
    valueType: "number",
    unit: "mm",
  },
  boot_capacity_l: {
    key: "automotive.capacity.boot_l",
    label: "Boot capacity",
    valueType: "number",
    unit: "l",
  },
  doors: {
    key: "automotive.body.doors",
    label: "Doors",
    valueType: "number",
  },
  seats: {
    key: "automotive.body.seats",
    label: "Seats",
    valueType: "number",
  },
};

function normalizeKey(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function inferUnit(key: string): string | null {
  if (key.endsWith("_kw")) return "kW";
  if (key.endsWith("_hp") || key.endsWith("_cv")) return "hp";
  if (key.endsWith("_nm")) return "Nm";
  if (key.endsWith("_kwh")) return "kWh";
  if (key.endsWith("_kmh")) return "km/h";
  if (key.endsWith("_km")) return "km";
  if (key.endsWith("_kg")) return "kg";
  if (key.endsWith("_mm")) return "mm";
  if (key.endsWith("_l")) return "l";
  if (key.endsWith("_s")) return "s";
  return null;
}

export function resolveAutomotiveMetric(
  rawKey: string,
  value: unknown,
): AutomotiveMetricDefinition {
  const normalized = normalizeKey(rawKey);
  const exact = DEFINITIONS[normalized];

  if (exact) {
    return exact;
  }

  const valueType =
    typeof value === "number"
      ? "number"
      : typeof value === "boolean"
        ? "boolean"
        : "string";

  return {
    key: `automotive.technical.${normalized || "unknown"}` as AutomotiveMetricKey,
    label: rawKey,
    valueType,
    unit: inferUnit(normalized),
  };
}
