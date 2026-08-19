import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSubtitleInsertSlot } from "../public/subtitle-insert.js";

describe("subtitle insert helpers", () => {
  it("returns the empty slot between adjacent subtitles", () => {
    const segments = [
      { id: "first", start: 0.6, end: 4.1 },
      { id: "second", start: 4.4, end: 8.2 },
    ];

    assert.deepEqual(getSubtitleInsertSlot(segments, "first", "second"), {
      index: 1,
      start: 4.1,
      end: 4.4,
    });
  });

  it("does not return a slot when adjacent subtitles touch", () => {
    const segments = [
      { id: "first", start: 0.6, end: 4.4 },
      { id: "second", start: 4.4, end: 8.2 },
    ];

    assert.equal(getSubtitleInsertSlot(segments, "first", "second"), null);
  });

  it("does not return a slot for non-adjacent subtitles", () => {
    const segments = [
      { id: "first", start: 0.6, end: 4.1 },
      { id: "second", start: 4.4, end: 8.2 },
      { id: "third", start: 8.5, end: 12.4 },
    ];

    assert.equal(getSubtitleInsertSlot(segments, "first", "third"), null);
  });
});
