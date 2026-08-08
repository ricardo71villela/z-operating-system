export {};

/**
 * Compatibility entry point.
 *
 * The former Golden Record merge model has been retired in favour of
 * Observation -> Resolution Policy -> Resolved Automotive Projection.
 */
console.warn(
  "automotive:golden:merge is deprecated. Use npm run automotive:resolved:build instead.",
);

await import("./build-resolved-profiles");
