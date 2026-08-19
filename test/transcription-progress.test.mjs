import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getTranscriptionProgressView } from "../public/transcription-progress.js";

describe("transcription progress view", () => {
  it("shows extracted-audio progress as indeterminate local work", () => {
    assert.deepEqual(getTranscriptionProgressView({ stage: "extracting-audio", percent: 30 }), {
      label: "本機抽取音訊",
      percent: 30,
      indeterminate: true,
      status: "正在用 ffmpeg 抽出低流量音訊...",
    });
  });

  it("uses server messages when provided", () => {
    assert.equal(
      getTranscriptionProgressView({ stage: "building-subtitles", message: "正在建立 12 段字幕", percent: 92 }).status,
      "正在建立 12 段字幕",
    );
  });

  it("falls back to queued for unknown events", () => {
    assert.equal(getTranscriptionProgressView({ stage: "mystery" }).label, "等待處理");
  });
});
