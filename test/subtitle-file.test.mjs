import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSubtitleFile } from "../public/subtitle-file.js";

describe("subtitle file parser", () => {
  it("parses SRT cues", () => {
    const segments = parseSubtitleFile(`1
00:00:00,600 --> 00:00:04,100
歡迎使用 AutoSub

2
00:00:04,400 --> 00:00:08,200
這是第二段
`);

    assert.deepEqual(segments, [
      { index: 1, start: 0.6, end: 4.1, text: "歡迎使用 AutoSub" },
      { index: 2, start: 4.4, end: 8.2, text: "這是第二段" },
    ]);
  });

  it("parses VTT cues with cue identifiers and settings", () => {
    const segments = parseSubtitleFile(`WEBVTT

intro
00:00.600 --> 00:04.100 align:center
第一行
第二行

00:04.400 --> 00:08.200
下一段
`);

    assert.deepEqual(segments, [
      { index: 1, start: 0.6, end: 4.1, text: "第一行\n第二行" },
      { index: 2, start: 4.4, end: 8.2, text: "下一段" },
    ]);
  });

  it("ignores invalid cues and throws when none are usable", () => {
    assert.throws(() => parseSubtitleFile("not a subtitle file"), /沒有可匯入/);
  });
});
