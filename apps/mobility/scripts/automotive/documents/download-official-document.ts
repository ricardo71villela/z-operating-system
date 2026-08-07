/**
 * Z Mobility
 * Official Documents Infrastructure
 *
 * Downloads an official document into memory.
 *
 * No filesystem access.
 */

import { createHash } from "node:crypto";

import type {
  DownloadedOfficialDocument,
  OfficialAttachment,
} from "./types";

export async function downloadOfficialDocument(
  attachment: OfficialAttachment,
): Promise<DownloadedOfficialDocument> {
  const response = await fetch(
    attachment.url,
    {
      redirect: "follow",
      headers: {
        "user-agent":
          "Z-Mobility-Official-Data-Importer/1.0",

        accept:
          "text/html,application/xhtml+xml,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/zip,application/octet-stream,*/*",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Official document request failed with HTTP ${response.status} for "${attachment.url}".`,
    );
  }

  const arrayBuffer =
    await response.arrayBuffer();

  const buffer =
    Buffer.from(arrayBuffer);

  const mimeType =
    response.headers.get("content-type") ??
    "application/octet-stream";

  const sha256 =
    createHash("sha256")
      .update(buffer)
      .digest("hex");

  return {
    attachment,
    buffer,
    sha256,
    mimeType,
    sizeBytes: buffer.byteLength,
  };
}