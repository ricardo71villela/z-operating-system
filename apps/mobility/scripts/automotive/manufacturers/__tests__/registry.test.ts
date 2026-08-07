import assert from "node:assert/strict";
import test from "node:test";

import {
  createTestManufacturerInput,
} from "./fixtures";

import {
  ManufacturerRegistry,
} from "../registry";

import type {
  ManufacturerAdapter,
  ManufacturerPipelineInput,
  ManufacturerSource,
} from "../contracts";

function createAdapter(
  id: string,
  canHandleResult = false,
): ManufacturerAdapter {
  return {
    id,

    manufacturerName:
      `${id} manufacturer`,

    brandName:
      id.toUpperCase(),

    countryCode: "DE",

    canHandle() {
      return canHandleResult;
    },

    async discoverSources(
      input: ManufacturerPipelineInput,
    ): Promise<ManufacturerSource[]> {
      return input.sources ?? [];
    },

    selectSources(
      sources:
        readonly ManufacturerSource[],
    ): ManufacturerSource[] {
      return [...sources];
    },
  };
}

function createInput(
  manufacturer = "",
): ManufacturerPipelineInput {
  return createTestManufacturerInput({
    manufacturer,
    brand:
      manufacturer.length > 0
        ? manufacturer.toUpperCase()
        : "Test",
  });
}

test(
  "registers and resolves an adapter by explicit id",
  () => {
    const registry =
      new ManufacturerRegistry();

    const adapter =
      createAdapter("bmw");

    registry.register(adapter);

    assert.equal(
      registry.resolve(
        createInput("bmw"),
      ),
      adapter,
    );
  },
);

test(
  "rejects duplicate adapter ids",
  () => {
    const registry =
      new ManufacturerRegistry();

    registry.register(
      createAdapter("bmw"),
    );

    assert.throws(
      () =>
        registry.register(
          createAdapter("bmw"),
        ),
      /already registered/,
    );
  },
);

test(
  "resolves by canHandle when no explicit id matches",
  () => {
    const registry =
      new ManufacturerRegistry();

    const adapter =
      createAdapter("bmw", true);

    registry.register(adapter);

    assert.equal(
      registry.resolve(
        createInput(),
      ),
      adapter,
    );
  },
);

test(
  "throws when no adapter can handle the input",
  () => {
    const registry =
      new ManufacturerRegistry();

    registry.register(
      createAdapter("bmw"),
    );

    assert.throws(
      () =>
        registry.resolve(
          createInput(),
        ),
      /No manufacturer adapter/,
    );
  },
);

test(
  "throws when multiple adapters match",
  () => {
    const registry =
      new ManufacturerRegistry();

    registry.register(
      createAdapter("audi", true),
    );

    registry.register(
      createAdapter("bmw", true),
    );

    assert.throws(
      () =>
        registry.resolve(
          createInput(),
        ),
      /Multiple manufacturer adapters/,
    );
  },
);

test(
  "gets and checks registered adapters",
  () => {
    const registry =
      new ManufacturerRegistry();

    const adapter =
      createAdapter("bmw");

    registry.register(adapter);

    assert.equal(
      registry.has("bmw"),
      true,
    );

    assert.equal(
      registry.get("bmw"),
      adapter,
    );

    assert.throws(
      () =>
        registry.get("audi"),
      /is not registered/,
    );
  },
);

test(
  "lists adapters in deterministic order",
  () => {
    const registry =
      new ManufacturerRegistry();

    registry.register(
      createAdapter("bmw"),
    );

    registry.register(
      createAdapter("audi"),
    );

    assert.deepEqual(
      registry
        .list()
        .map(
          (adapter) =>
            adapter.id,
        ),
      [
        "audi",
        "bmw",
      ],
    );
  },
);