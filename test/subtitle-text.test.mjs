import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSplitUnits, estimateSpeechProgressRatio } from "../public/subtitle-text.js";

describe("subtitle text helpers", () => {
  it("creates clickable split units for Chinese characters and English words", () => {
    const units = createSplitUnits("歡迎 use AutoSub。");

    assert.deepEqual(units.slice(0, 6), [
      { text: "歡", start: 0, canSplit: false, className: "is-leading" },
      { text: "迎", start: 1, canSplit: true, className: "" },
      { text: " ", start: 2, canSplit: false, className: "is-space" },
      { text: "use", start: 3, canSplit: true, className: "" },
      { text: " ", start: 6, canSplit: false, className: "is-space" },
      { text: "AutoSub", start: 7, canSplit: true, className: "" },
    ]);
    assert.deepEqual(units.at(-1), { text: "。", start: 14, canSplit: false, className: "is-punctuation" });
  });

  it("estimates split timing with speech weights instead of plain character count", () => {
    const text = "Welcome use AutoSub now";
    const useStartsAt = Array.from(text).indexOf("u");
    const ratio = estimateSpeechProgressRatio(text, useStartsAt);

    assert.ok(ratio > 0.25);
    assert.ok(ratio < 0.35);
  });

  it("keeps early split points near the beginning without pinning them to character count", () => {
    const ratio = estimateSpeechProgressRatio("歡迎使用 AutoSub", 1);

    assert.ok(ratio > 0.08);
    assert.ok(ratio < 0.2);
  });

});
