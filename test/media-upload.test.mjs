import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAudioExtractionArgs, createExtractedAudioFileName, shouldExtractAudio } from "../src/media-upload.mjs";

describe("media upload helpers", () => {
  it("extracts audio for video uploads", () => {
    assert.equal(shouldExtractAudio({ contentType: "video/mp4", fileName: "demo.mp4" }), true);
  });

  it("does not extract audio for audio uploads", () => {
    assert.equal(shouldExtractAudio({ contentType: "audio/mpeg", fileName: "demo.mp3" }), false);
  });

  it("uses file extensions when content type is generic", () => {
    assert.equal(shouldExtractAudio({ contentType: "application/octet-stream", fileName: "demo.mov" }), true);
    assert.equal(shouldExtractAudio({ contentType: "application/octet-stream", fileName: "demo.wav" }), false);
  });

  it("creates mp3 names for extracted audio", () => {
    assert.equal(createExtractedAudioFileName("TwinCAT.mp4"), "TwinCAT.mp3");
    assert.equal(createExtractedAudioFileName(""), "media.mp3");
  });

  it("builds ffmpeg args for the first audio stream", () => {
    assert.deepEqual(createAudioExtractionArgs("input.mp4", "output.mp3"), [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      "input.mp4",
      "-map",
      "0:a:0",
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "64k",
      "output.mp3",
    ]);
  });
});
