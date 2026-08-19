import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getQualityIssueNavigationIndex } from "../public/quality-navigation.js";

describe("quality issue navigation", () => {
  const issues = [{ id: "first" }, { id: "second" }, { id: "third" }];

  it("moves to the next issue", () => {
    assert.equal(getQualityIssueNavigationIndex(issues, 0, "next"), 1);
  });

  it("moves to the previous issue", () => {
    assert.equal(getQualityIssueNavigationIndex(issues, 1, "previous"), 0);
  });

  it("wraps at the ends", () => {
    assert.equal(getQualityIssueNavigationIndex(issues, 2, "next"), 0);
    assert.equal(getQualityIssueNavigationIndex(issues, 0, "previous"), 2);
  });

  it("starts from the first or last issue when none is active", () => {
    assert.equal(getQualityIssueNavigationIndex(issues, -1, "next"), 0);
    assert.equal(getQualityIssueNavigationIndex(issues, -1, "previous"), 2);
  });

  it("returns -1 when there are no issues", () => {
    assert.equal(getQualityIssueNavigationIndex([], -1, "next"), -1);
  });
});
