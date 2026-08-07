export function normalizeVersionName(
  value: string,
  brand: string,
  model: string,
): string {
  let normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

  for (const prefix of [
    `${brand.toLowerCase()} ${model.toLowerCase()} `,
    `${model.toLowerCase()} `,
    `${brand.toLowerCase()} `,
  ]) {
    if (normalized.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length);
      break;
    }
  }

  return normalized.replace(/\s+/g, " ").trim();
}

export function versionSimilarityScore(left: string, right: string): number {
  if (left === right) return 100;
  const leftWords = new Set(left.split(" "));
  const rightWords = new Set(right.split(" "));
  const intersection = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union === 0 ? 0 : Math.round((intersection / union) * 100);
}
