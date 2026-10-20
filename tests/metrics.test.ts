import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeMetricMethod,
  normalizeMetricRoute,
} from "../src/infrastructure/metrics/metrics.service";

describe("metrics label normalization", () => {
  it("uses route templates and a bounded fallback instead of request paths", () => {
    assert.equal(normalizeMetricRoute("/:ticketId/ai-analysis"), "/:ticketId/ai-analysis");
    assert.equal(normalizeMetricRoute(undefined), "unmatched");
    assert.equal(normalizeMetricRoute(["/untrusted", "/path"]), "unmatched");
  });

  it("maps nonstandard request methods to a bounded label", () => {
    assert.equal(normalizeMetricMethod("get"), "GET");
    assert.equal(normalizeMetricMethod("custom-method-123"), "OTHER");
  });
});
