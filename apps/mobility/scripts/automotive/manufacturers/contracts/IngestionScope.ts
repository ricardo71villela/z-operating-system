export type ManufacturerIngestionScope =
  | {
      kind: "global";
    }
  | {
      kind: "market";
      marketCode: string;
    };
