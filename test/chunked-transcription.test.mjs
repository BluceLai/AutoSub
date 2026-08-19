import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAudioChunkArgs,
  createChunkCacheFileName,
  createChunkPlan,
  createEmptyChunkCache,
  mergeChunkResults,
  offsetSegments,
  recordCompletedChunk,
  restoreCompletedChunkResults,
  shouldChunkTranscription,
} from "../src/chunked-transcription.mjs";

describe("chunked transcription", () => {
  it("chunks only media longer than the threshold", () => {
    assert.equal(shouldChunkTranscription(299, 300), false);
    assert.equal(shouldChunkTranscription(300, 300), false);
    assert.equal(shouldChunkTranscription(301, 300), true);
  });

  it("creates fixed-size chunks with a final remainder", () => {
    assert.deepEqual(createChunkPlan(620, 300), [
      { index: 0, start: 0, end: 300, duration: 300 },
      { index: 1, start: 300, end: 600, duration: 300 },
      { index: 2, start: 600, end: 620, duration: 20 },
    ]);
  });

  it("builds ffmpeg args for extracting one audio chunk", () => {
    assert.deepEqual(createAudioChunkArgs("input.mp3", "chunk-001.mp3", { start: 300, duration: 120 }), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      "300",
      "-i",
      "input.mp3",
      "-t",
      "120",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      "chunk-001.mp3",
    ]);
  });

  it("offsets chunk-local subtitle times back onto the original timeline", () => {
    assert.deepEqual(offsetSegments([{ id: "a", start: 1.2, end: 2.4, text: "第二段" }], 300), [
      { id: "a", start: 301.2, end: 302.4, text: "第二段" },
    ]);
  });

  it("merges chunk results and renumbers subtitles", () => {
    assert.deepEqual(
      mergeChunkResults([
        { text: "第一段", language: "zh", segments: [{ id: "a", index: 9, start: 0, end: 1, text: "第一段" }] },
        { text: "第二段", language: "zh", segments: [{ id: "b", index: 9, start: 301, end: 302, text: "第二段" }] },
      ]),
      {
        text: "第一段 第二段",
        language: "zh",
        segments: [
          { id: "a", index: 1, start: 0, end: 1, text: "第一段" },
          { id: "b", index: 2, start: 301, end: 302, text: "第二段" },
        ],
      },
    );
  });

  it("creates stable cache filenames for the same media identity", () => {
    assert.equal(
      createChunkCacheFileName({
        projectKey: "autosub:project:demo",
        fileName: "demo.mp4",
        fileSize: 123,
        model: "whisper-1",
        chunkSeconds: 300,
      }),
      "af2a35348046514b3647080d.json",
    );
  });

  it("restores completed chunks and records new completed chunks", () => {
    const chunks = createChunkPlan(620, 300);
    const cache = createEmptyChunkCache({
      projectKey: "project",
      fileName: "demo.mp4",
      fileSize: 123,
      model: "whisper-1",
      chunkSeconds: 300,
      chunks,
    });
    const result = { text: "第一段", segments: [] };

    recordCompletedChunk(cache, chunks[0], result, "2026-08-19T00:00:00.000Z");

    assert.deepEqual(restoreCompletedChunkResults(cache, chunks), [result, null, null]);
  });
});
