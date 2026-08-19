import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getSubtitleQualityIssues } from "../public/subtitle-quality.js";

describe("subtitle quality checks", () => {
  it("reports clean subtitles without issues", () => {
    const issues = getSubtitleQualityIssues([
      { id: "a", start: 0.6, end: 4.1, text: "歡迎使用 AutoSub。" },
      { id: "b", start: 4.4, end: 8.2, text: "你可以播放影片，確認字幕會跟著時間顯示。" },
    ]);

    assert.deepEqual(issues, []);
  });

  it("reports empty text, overlaps, short duration, long duration, and fast reading", () => {
    const issues = getSubtitleQualityIssues([
      { id: "a", start: 0, end: 0.2, text: "太快了太快了太快了" },
      { id: "b", start: 0.1, end: 1, text: "   " },
      { id: "c", start: 1.2, end: 9, text: "這一段時間比較長" },
    ]);

    assert.deepEqual(
      issues.map((issue) => [issue.segmentId, issue.severity, issue.kind]),
      [
        ["a", "warning", "too-short"],
        ["a", "warning", "fast-reading"],
        ["b", "error", "empty-text"],
        ["b", "error", "overlap"],
        ["c", "info", "too-long"],
      ],
    );
  });

  it("reports invalid durations before other duration-based checks", () => {
    const issues = getSubtitleQualityIssues([{ id: "a", start: 2, end: 1.5, text: "時間反了" }]);

    assert.deepEqual(
      issues.map((issue) => [issue.severity, issue.kind, issue.message]),
      [["error", "invalid-duration", "結束時間早於開始時間"]],
    );
  });
});
