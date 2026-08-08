/**
 * Z Mobility
 * Official Documents Infrastructure
 *
 * Pure utilities for official attachments.
 *
 * No fetch.
 * No filesystem access.
 * No external services.
 */

import type {
  OfficialAttachment,
  OfficialAttachmentType,
} from "./types";

const SUPPORTED_EXTENSIONS =
  /\.(pdf|xlsx|xls|zip)(?:$|[?#])/i;

const SUPPORTED_LINK_TEXT =
  /\b(pdf|download|attachment|specifications|technical data|technical specifications|press kit|facts? (?:&|and) figures)\b/i;

export function inferAttachmentType(
  url: string,
): OfficialAttachmentType {
  let pathname = url;

  try {
    pathname = new URL(url).pathname;
  } catch {
    // Relative paths are also supported.
  }

  const normalized =
    pathname.toLowerCase();

  if (/\.pdf$/i.test(normalized)) {
    return "pdf";
  }

  if (/\.xlsx$/i.test(normalized)) {
    return "xlsx";
  }

  if (/\.xls$/i.test(normalized)) {
    return "xls";
  }

  if (/\.zip$/i.test(normalized)) {
    return "zip";
  }

  return "unknown";
}

export function normalizeAttachmentUrl(
  href: string,
  baseUrl: string,
): string | null {
  const normalizedHref = href.trim();

  if (
    normalizedHref.length === 0 ||
    normalizedHref === "#" ||
    /^(?:javascript|mailto|tel):/i.test(
      normalizedHref,
    )
  ) {
    return null;
  }

  try {
    const url = new URL(
      normalizedHref,
      baseUrl,
    );

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    url.hash = "";

    return url.toString();
  } catch {
    return null;
  }
}

function getFilenameFromUrl(
  url: string,
): string | null {
  try {
    const pathname =
      new URL(url).pathname;

    const filename =
      pathname
        .split("/")
        .filter(Boolean)
        .at(-1);

    if (!filename) {
      return null;
    }

    return decodeURIComponent(filename);
  } catch {
    return null;
  }
}

export function extractAttachmentTitle(
  elementText: string,
  titleAttribute?: string,
  url?: string,
): string {
  const normalizedText =
    elementText.trim();

  if (normalizedText.length > 0) {
    return normalizedText;
  }

  const normalizedTitle =
    titleAttribute?.trim() ?? "";

  if (normalizedTitle.length > 0) {
    return normalizedTitle;
  }

  if (url) {
    const filename =
      getFilenameFromUrl(url);

    if (filename) {
      return filename;
    }
  }

  return "Untitled attachment";
}

export function isSupportedAttachment(
  href: string,
  text: string,
): boolean {
  return (
    SUPPORTED_EXTENSIONS.test(href) ||
    SUPPORTED_LINK_TEXT.test(text)
  );
}

export function removeDuplicateAttachments(
  attachments:
    readonly OfficialAttachment[],
): OfficialAttachment[] {
  const uniqueAttachments:
    OfficialAttachment[] = [];

  const seenUrls =
    new Set<string>();

  for (const attachment of attachments) {
    const normalizedUrl =
      attachment.url.trim();

    if (
      normalizedUrl.length === 0 ||
      seenUrls.has(normalizedUrl)
    ) {
      continue;
    }

    seenUrls.add(normalizedUrl);

    uniqueAttachments.push(
      attachment,
    );
  }

  return uniqueAttachments;
}