import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSubtitleJumpTarget } from "../public/subtitle-navigation.js";

describe("subtitle navigation helpers", () => {
  const segments = [
    { id: "first", start: 0.6, end: 4.1 },
    { id: "second", start: 4.4, end: 8.2 },
    { id: "third", start: 8.5, end: 12.4 },
  ];

  it("jumps from the active subtitle to the next subtitle start", () => {
    assert.equal(getSubtitleJumpTarget(segments, 1, "next", "first"), 4.4);
  });

  it("jumps from the active subtitle to the previous subtitle start", () => {
    assert.equal(getSubtitleJumpTarget(segments, 5, "previous", "second"), 0.6);
  });

  it("uses current time when playback is between subtitles", () => {
    assert.equal(getSubtitleJumpTarget(segments, 4.2, "next"), 4.4);
    assert.equal(getSubtitleJumpTarget(segments, 4.2, "previous"), 0.6);
  });

  it("returns null when there is no subtitle in that direction", () => {
    assert.equal(getSubtitleJumpTarget(segments, 1, "previous", "first"), null);
    assert.equal(getSubtitleJumpTarget(segments, 10, "next", "third"), null);
  });
});
