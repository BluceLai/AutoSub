import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createSampleMediaArgs, createSampleOutputPath, parseSampleArgs, stripExtension } from "../src/sample-media.mjs";

describe("sample media helpers", () => {
  it("creates mp4 output paths for video clips", () => {
    assert.match(
      createSampleOutputPath({
        source: "C:/media/training.mp4",
        outputDir: "C:/out",
        start: 0,
        duration: 20,
        audioOnly: false,
      }),
      /training-0s-20s\.mp4$/,
    );
  });

  it("creates mp3 output paths for online transcription smoke tests", () => {
    assert.match(
      createSampleOutputPath({
        source: "C:/media/training.mp4",
        outputDir: "C:/out",
        start: 0,
        duration: 10,
        audioOnly: true,
      }),
      /training-0s-10s\.mp3$/,
    );
  });

  it("builds ffmpeg args for a copied video clip", () => {
    assert.deepEqual(createSampleMediaArgs({ source: "in.mp4", start: 0, duration: 20, output: "out.mp4" }), [
      "-hide_banner",
      "-y",
      "-ss",
      "0",
      "-i",
      "in.mp4",
      "-t",
      "20",
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      "out.mp4",
    ]);
  });

  it("builds ffmpeg args for a 10-second audio-only sample", () => {
    assert.deepEqual(
      createSampleMediaArgs({ source: "in.mp4", start: 0, duration: 10, output: "out.mp3", audioOnly: true }),
      [
        "-hide_banner",
        "-y",
        "-ss",
        "0",
        "-i",
        "in.mp4",
        "-t",
        "10",
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-b:a",
        "64k",
        "out.mp3",
      ],
    );
  });

  it("strips only the final extension", () => {
    assert.equal(stripExtension("course.section.mp4"), "course.section");
  });

  it("parses separated and equals-style CLI options", () => {
    assert.deepEqual(parseSampleArgs(["--duration=10", "--start", "2", "--audio-only"]), {
      duration: 10,
      start: 2,
      audioOnly: true,
    });
  });

  it("rejects invalid numeric CLI options", () => {
    assert.throws(() => parseSampleArgs(["--duration=-1"]), /duration/);
  });
});
