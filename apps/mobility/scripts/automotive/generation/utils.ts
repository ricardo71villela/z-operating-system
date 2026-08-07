/**
 * Z Mobility
 * Official Records Generation Engine
 *
 * Shared parsing and filesystem utilities.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  NumericRange,
} from "./parser-types";

export function normalizeText(
  value: string,
): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(
  value: string,
): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function unique<T>(
  values: readonly T[],
): T[] {
  return [...new Set(values)];
}

export function parseLocalizedNumber(
  value: string | null | undefined,
): number | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value)
    .replace(/\s/g, "")
    .replace(",", ".");

  const match = normalized.match(
    /-?\d+(?:\.\d+)?/,
  );

  if (!match) {
    return null;
  }

  const parsed = Number(match[0]);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function parseNumericRange(
  value: string | null | undefined,
): NumericRange {
  if (!value) {
    return {
      min: null,
      max: null,
    };
  }

  const primaryValue = normalizeText(value)
    .split("(")[0]
    ?.trim();

  if (!primaryValue) {
    return {
      min: null,
      max: null,
    };
  }

  const matches = primaryValue.match(
    /\d+(?:[.,]\d+)?/g,
  );

  if (!matches || matches.length === 0) {
    return {
      min: null,
      max: null,
    };
  }

  const values = matches
    .map((match) =>
      parseLocalizedNumber(match),
    )
    .filter(
      (number): number is number =>
        number !== null,
    );

  if (values.length === 0) {
    return {
      min: null,
      max: null,
    };
  }

  if (values.length === 1) {
    return {
      min: values[0],
      max: values[0],
    };
  }

  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function findProjectRoot(
  startDirectory: string,
): string {
  let currentDirectory = path.resolve(
    startDirectory,
  );

  while (true) {
    const packageJsonPath = path.join(
      currentDirectory,
      "package.json",
    );

    const automotiveDirectory = path.join(
      currentDirectory,
      "scripts",
      "automotive",
    );

    if (
      existsSync(packageJsonPath) &&
      existsSync(automotiveDirectory)
    ) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(
      currentDirectory,
    );

    if (
      parentDirectory === currentDirectory
    ) {
      throw new Error(
        "Unable to locate the project root.",
      );
    }

    currentDirectory = parentDirectory;
  }
}

export async function loadJsonFile<T>(
  filePath: string,
): Promise<T> {
  assertFileExists(filePath);

  const rawContent = await readFile(
    filePath,
    "utf8",
  );

  try {
    return JSON.parse(rawContent) as T;
  } catch (error) {
    throw new Error(
      `Invalid JSON in "${filePath}": ${
        error instanceof Error
          ? error.message
          : "unknown parsing error"
      }`,
    );
  }
}

export function assertFileExists(
  filePath: string,
): void {
  if (!existsSync(filePath)) {
    throw new Error(
      `File not found: ${filePath}`,
    );
  }
}