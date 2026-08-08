import assert from "node:assert/strict";
import test from "node:test";

import {
  extractHtmlDocument,
} from "../extract-html-document";

import type {
  DownloadedOfficialDocument,
} from "../types";

function createDocument(
  html: string,
): DownloadedOfficialDocument {
  return {
    attachment: {
      url:
        "https://example.com/specifications",
      title:
        "Official specifications",
      type: "unknown",
    },

    buffer:
      Buffer.from(html, "utf8"),

    sha256:
      "test-sha256",

    mimeType:
      "text/html",

    sizeBytes:
      Buffer.byteLength(
        html,
        "utf8",
      ),
  };
}

test(
  "extracts metadata, paragraphs and tables from HTML",
  async () => {
    const document =
      createDocument(`
        <!doctype html>
        <html lang="en">
          <head>
            <title>BMW i5 Specifications</title>

            <meta
              name="description"
              content="Official BMW technical data"
            >

            <link
              rel="canonical"
              href="https://example.com/bmw-i5"
            >

            <script type="application/ld+json">
              {
                "@type": "Product",
                "name": "BMW i5"
              }
            </script>
          </head>

          <body>
            <main>
              <h1>BMW i5</h1>

              <p>
                The BMW i5 produces 250 kW and
                430 Nm of maximum torque.
              </p>

              <table>
                <caption>
                  Technical specifications
                </caption>

                <thead>
                  <tr>
                    <th>Variant</th>
                    <th>Power</th>
                  </tr>
                </thead>

                <tbody>
                  <tr>
                    <td>i5 eDrive40</td>
                    <td>250 kW</td>
                  </tr>
                </tbody>
              </table>
            </main>
          </body>
        </html>
      `);

    const result =
      await extractHtmlDocument(
        document,
      );

    assert.equal(
      result.type,
      "html",
    );

    assert.equal(
      result.title,
      "BMW i5 Specifications",
    );

    assert.equal(
      result.language,
      "en",
    );

    assert.equal(
      result.paragraphs.length,
      1,
    );

    assert.equal(
      result.tables.length,
      1,
    );

    assert.deepEqual(
      result.tables[0].headers,
      ["Variant", "Power"],
    );

    assert.deepEqual(
      result.tables[0].rows,
      [
        [
          "i5 eDrive40",
          "250 kW",
        ],
      ],
    );
  },
);

test(
  "extracts technical text signals",
  async () => {
    const document =
      createDocument(`
        <html>
          <body>
            <main>
              <p>
                Output is 250 kW with 430 Nm.
                Consumption is 18.2 kWh/100 km.
                Range is 516 km.
              </p>
            </main>
          </body>
        </html>
      `);

    const result =
      await extractHtmlDocument(
        document,
      );

    const textSignals =
      result.metadata.textSignals as {
        powerValues: string[];
        torqueValues: string[];
        consumptionValues: string[];
        rangeValues: string[];
      };

    assert.deepEqual(
      textSignals.powerValues,
      ["250 kW"],
    );

    assert.deepEqual(
      textSignals.torqueValues,
      ["430 Nm"],
    );

    assert.deepEqual(
      textSignals
        .consumptionValues,
      ["18.2 kWh/100 km"],
    );

    assert.deepEqual(
      textSignals.rangeValues,
      ["516 km"],
    );
  },
);

test(
  "ignores invalid JSON-LD",
  async () => {
    const document =
      createDocument(`
        <html>
          <head>
            <script type="application/ld+json">
              invalid-json
            </script>
          </head>

          <body>
            <main>
              <p>
                This paragraph is long enough
                to be included in extraction.
              </p>
            </main>
          </body>
        </html>
      `);

    const result =
      await extractHtmlDocument(
        document,
      );

    assert.deepEqual(
      result.metadata.jsonLd,
      [],
    );
  },
);