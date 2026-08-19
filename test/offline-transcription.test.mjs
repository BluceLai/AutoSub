import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOfflineCheckSummary,
  createOfflineEngineReport,
  offlineEngineCandidates,
  selectPreferredOfflineEngine,
} from "../src/offline-transcription.mjs";

describe("offline transcription engine checks", () => {
  it("tracks whisper.cpp and faster-whisper as offline candidates", () => {
    assert.deepEqual(
      offlineEngineCandidates.map((engine) => engine.id),
      ["whisper-cpp", "faster-whisper"],
    );
  });

  it("reports missing commands without requiring downloads", async () => {
    const report = await createOfflineEngineReport({
      env: {},
      commandLookup: async () => null,
    });

    assert.deepEqual(
      report.engines.map((engine) => ({ id: engine.id, status: engine.status, commandPath: engine.commandPath })),
      [
        { id: "whisper-cpp", status: "missing-command", commandPath: null },
        { id: "faster-whisper", status: "missing-command", commandPath: null },
      ],
    );
  });

  it("requires a local model path before an installed command is ready", async () => {
    const report = await createOfflineEngineReport({
      env: {},
      commandLookup: async (command) => (command === "whisper-cli" ? "C:/tools/whisper-cli.exe" : null),
    });

    assert.equal(report.engines[0].status, "needs-model");
    assert.equal(report.engines[0].commandPath, "C:/tools/whisper-cli.exe");
    assert.equal(report.engines[0].modelPath, null);
  });

  it("marks an engine ready when command and model path are configured", async () => {
    const report = await createOfflineEngineReport({
      env: { AUTOSUB_WHISPER_CPP_MODEL: "C:/models/ggml-small.bin" },
      commandLookup: async (command) => (command === "whisper-cli" ? "C:/tools/whisper-cli.exe" : null),
    });

    assert.equal(report.engines[0].status, "ready");
    assert.equal(report.engines[0].modelPath, "C:/models/ggml-small.bin");
  });

  it("prefers a ready whisper.cpp engine for the first offline integration", async () => {
    const report = await createOfflineEngineReport({
      env: {
        AUTOSUB_WHISPER_CPP_MODEL: "C:/models/ggml-small.bin",
        AUTOSUB_FASTER_WHISPER_MODEL: "C:/models/faster-whisper-small",
      },
      commandLookup: async (command) => {
        if (command === "whisper-cli") return "C:/tools/whisper-cli.exe";
        if (command === "faster-whisper") return "C:/Python/Scripts/faster-whisper.exe";
        return null;
      },
    });

    assert.equal(selectPreferredOfflineEngine(report).id, "whisper-cpp");
  });

  it("creates a human-readable setup summary", async () => {
    const report = await createOfflineEngineReport({
      env: {},
      commandLookup: async () => null,
    });

    assert.match(createOfflineCheckSummary(report), /whisper\.cpp: 未找到 CLI/);
    assert.match(createOfflineCheckSummary(report), /faster-whisper: 未找到 CLI/);
  });
});
