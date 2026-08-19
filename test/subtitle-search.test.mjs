import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findSubtitleMatches, replaceAllSubtitleMatches, replaceSubtitleMatch } from "../public/subtitle-search.js";

describe("subtitle search helpers", () => {
  const segments = [
    { id: "first", start: 0.6, end: 4.1, text: "歡迎使用 AutoSub，AutoSub 很快。" },
    { id: "second", start: 4.4, end: 8.2, text: "搜尋字幕文字。" },
  ];

  it("finds matches across subtitle segments", () => {
    assert.deepEqual(findSubtitleMatches(segments, "autosub"), [
      { segmentId: "first", segmentIndex: 0, start: 5, end: 12 },
      { segmentId: "first", segmentIndex: 0, start: 13, end: 20 },
    ]);
  });

  it("returns no matches for blank searches", () => {
    assert.deepEqual(findSubtitleMatches(segments, "   "), []);
  });

  it("replaces one selected match without changing other matches", () => {
    const [match] = findSubtitleMatches(segments, "AutoSub");

    assert.equal(replaceSubtitleMatch(segments, match, "字幕工具")[0].text, "歡迎使用 字幕工具，AutoSub 很快。");
  });

  it("replaces all matches case-insensitively", () => {
    assert.equal(replaceAllSubtitleMatches(segments, "autosub", "字幕工具")[0].text, "歡迎使用 字幕工具，字幕工具 很快。");
  });
});
