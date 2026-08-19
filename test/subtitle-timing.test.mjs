import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clampSegmentEnd,
  clampSegmentShift,
  clampSegmentStart,
  enforceNonOverlappingSegments,
  getWheelTimeDelta,
} from "../public/subtitle-timing.js";

describe("subtitle timing helpers", () => {
  it("prevents a segment end from passing the next segment start", () => {
    const segments = [
      { id: "first", start: 0, end: 4 },
      { id: "second", start: 4.4, end: 8 },
    ];

    assert.equal(clampSegmentEnd(segments, "first", 500), 4.4);
  });

  it("prevents a segment start from passing previous end or its own end", () => {
    const segments = [
      { id: "first", start: 0, end: 4 },
      { id: "second", start: 4.4, end: 8 },
      { id: "third", start: 8.2, end: 12 },
    ];

    assert.equal(clampSegmentStart(segments, "second", 3), 4);
    assert.equal(clampSegmentStart(segments, "second", 9), 7.9);
  });

  it("prevents nudging a whole segment into neighbors", () => {
    const segments = [
      { id: "first", start: 0, end: 4.4 },
      { id: "second", start: 4.4, end: 8 },
    ];

    assert.equal(clampSegmentShift(segments, "first", 0.1), 0);
    assert.equal(clampSegmentShift(segments, "second", -0.5), 0);
  });

  it("normalizes loaded segments so earlier segments do not overlap later ones", () => {
    const segments = [
      { id: "first", start: 0, end: 10 },
      { id: "second", start: 4.4, end: 8 },
    ];

    enforceNonOverlappingSegments(segments);

    assert.equal(segments[0].end, 4.4);
  });

  it("maps mouse wheel direction to tenth-second changes", () => {
    assert.equal(getWheelTimeDelta(-100), 0.1);
    assert.equal(getWheelTimeDelta(100), -0.1);
  });
});
