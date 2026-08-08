/**
 * Z Mobility
 * Official Documents Infrastructure
 *
 * Discovers supported official attachments in HTML.
 *
 * No fetch.
 * No filesystem access.
 * No external services.
 */

import * as cheerio from "cheerio";

import {
  extractAttachmentTitle,
  inferAttachmentType,
  isSupportedAttachment,
  normalizeAttachmentUrl,
  removeDuplicateAttachments,
} from "./attachment-utils";

import type {
  OfficialAttachment,
} from "./types";

export function discoverOfficialAttachments(
  html: string,
  baseUrl: string,
): OfficialAttachment[] {
  const $ = cheerio.load(html);

  const attachments:
    OfficialAttachment[] = [];

  $("a[href]").each((_, element) => {
    const anchor = $(element);

    const href =
      anchor.attr("href")?.trim() ?? "";

    const visibleText =
      anchor.text().trim();

    const titleAttribute =
      anchor.attr("title")?.trim();

    const ariaLabel =
      anchor.attr("aria-label")?.trim();

    const combinedText = [
      visibleText,
      titleAttribute,
      ariaLabel,
    ]
      .filter(
        (value): value is string =>
          Boolean(
            value &&
            value.length > 0,
          ),
      )
      .join(" ");

    if (
      !isSupportedAttachment(
        href,
        combinedText,
      )
    ) {
      return;
    }

    const normalizedUrl =
      normalizeAttachmentUrl(
        href,
        baseUrl,
      );

    if (normalizedUrl === null) {
      return;
    }

    attachments.push({
      url: normalizedUrl,

      title:
        extractAttachmentTitle(
          visibleText ||
            ariaLabel ||
            "",
          titleAttribute,
          normalizedUrl,
        ),

      type:
        inferAttachmentType(
          normalizedUrl,
        ),
    });
  });

  return removeDuplicateAttachments(
    attachments,
  );
}