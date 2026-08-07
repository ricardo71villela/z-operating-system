import { BaseAdapter } from "../../core/BaseAdapter";
import type {
  AdapterContext,
  ExternalAutomotiveRecord,
} from "../../core/types";

type NhtsaMake = {
  Make_ID: number;
  Make_Name: string;
};

type NhtsaResponse = {
  Count: number;
  Message: string;
  SearchCriteria: string | null;
  Results: NhtsaMake[];
};

const NHTSA_GET_ALL_MAKES_URL =
  "https://vpic.nhtsa.dot.gov/api/vehicles/GetAllMakes?format=json";

export class NhtsaMakesAdapter extends BaseAdapter {
  readonly sourceCode = "nhtsa_vpic";
  readonly entityType = "brand" as const;

  async fetchRecords(
    _context: AdapterContext,
  ): Promise<ExternalAutomotiveRecord[]> {
    void _context;
    const response = await fetch(
      NHTSA_GET_ALL_MAKES_URL,
      {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Z-Mobility-Automotive-Importer/1.0",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!response.ok) {
      throw new Error(
        `NHTSA request failed: ${response.status} ${response.statusText}`,
      );
    }

    const payload =
      (await response.json()) as NhtsaResponse;

    if (!Array.isArray(payload.Results)) {
      throw new Error(
        "NHTSA response does not contain a valid Results array.",
      );
    }

    return payload.Results.map((make) => {
      const externalId = this.requireExternalId(
        make.Make_ID,
        make.Make_Name,
      );

      return {
        entityType: this.entityType,
        externalId,
        externalParentId: null,
        rawName: this.cleanString(make.Make_Name),
        countryCode: null,
        marketCode: "US",
        payload: make,
      };
    });
  }
}