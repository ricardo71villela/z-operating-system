import type {
  ManufacturerOfficialRecord,
} from "../../core/manufacturer-types";

import {
  AudiA1GBOfficialVariants,
} from "../../data/audi/a1-gb";
import {
  AudiA38YOfficialVariants,
} from "../../data/audi/a3-8y";
import {
  AudiA5B10OfficialVariants,
} from "../../data/audi/a5-b10";
import {
  AudiA6C9OfficialVariants,
} from "../../data/audi/a6-c9";
import {
  AudiA7OfficialVariants,
} from "../../data/audi/a7";
import {
  AudiA8OfficialVariants,
} from "../../data/audi/a8";
import {
  AudiETronGTOfficialVariants,
} from "../../data/audi/e-tron-gt";
import {
  AudiQ2GAOfficialVariants,
} from "../../data/audi/q2-ga";
import {
  AudiQ3F3OfficialVariants,
} from "../../data/audi/q3-f3";
import {
  AudiQ4ETronOfficialVariants,
} from "../../data/audi/q4-e-tron";
import {
  AudiQ5GUOfficialVariants,
} from "../../data/audi/q5-gu";
import {
  AudiQ6ETronOfficialVariants,
} from "../../data/audi/q6-e-tron";
import {
  AudiQ74MOfficialVariants,
} from "../../data/audi/q7-4m";
import {
  AudiQ84MOfficialVariants,
} from "../../data/audi/q8-4m";
import {
  AudiR84SOfficialVariants,
} from "../../data/audi/r8-4s";
import {
  AudiTTFVOfficialVariants,
} from "../../data/audi/tt-fv";

export type AudiOfficialSourceManifestEntry = {
  modelSlug: string;
  modelName: string;
  records: readonly ManufacturerOfficialRecord[];
};

/**
 * Repository-backed authority for Audi sources already reviewed by Z Mobility.
 *
 * This is intentionally a source manifest, not an ingestion result. The
 * Universal Manufacturer Pipeline re-downloads and re-extracts these official
 * URLs instead of treating the legacy records as fresh ingestion output.
 */
export const audiOfficialSourceManifest:
  readonly AudiOfficialSourceManifestEntry[] = [
    {
      modelSlug: "a1-gb",
      modelName: "A1",
      records: AudiA1GBOfficialVariants,
    },
    {
      modelSlug: "a3-8y",
      modelName: "A3",
      records: AudiA38YOfficialVariants,
    },
    {
      modelSlug: "a5-b10",
      modelName: "A5",
      records: AudiA5B10OfficialVariants,
    },
    {
      modelSlug: "a6-c9",
      modelName: "A6",
      records: AudiA6C9OfficialVariants,
    },
    {
      modelSlug: "a7",
      modelName: "A7",
      records: AudiA7OfficialVariants,
    },
    {
      modelSlug: "a8",
      modelName: "A8",
      records: AudiA8OfficialVariants,
    },
    {
      modelSlug: "q2-ga",
      modelName: "Q2",
      records: AudiQ2GAOfficialVariants,
    },
    {
      modelSlug: "q3-f3",
      modelName: "Q3",
      records: AudiQ3F3OfficialVariants,
    },
    {
      modelSlug: "q4-e-tron",
      modelName: "Q4 e-tron",
      records: AudiQ4ETronOfficialVariants,
    },
    {
      modelSlug: "q5-gu",
      modelName: "Q5",
      records: AudiQ5GUOfficialVariants,
    },
    {
      modelSlug: "q6-e-tron",
      modelName: "Q6 e-tron",
      records: AudiQ6ETronOfficialVariants,
    },
    {
      modelSlug: "q7-4m",
      modelName: "Q7",
      records: AudiQ74MOfficialVariants,
    },
    {
      modelSlug: "q8-4m",
      modelName: "Q8",
      records: AudiQ84MOfficialVariants,
    },
    {
      modelSlug: "e-tron-gt",
      modelName: "e-tron GT",
      records: AudiETronGTOfficialVariants,
    },
    {
      modelSlug: "tt-fv",
      modelName: "TT",
      records: AudiTTFVOfficialVariants,
    },
    {
      modelSlug: "r8-4s",
      modelName: "R8",
      records: AudiR84SOfficialVariants,
    },
  ];
