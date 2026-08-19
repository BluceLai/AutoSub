import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createTranscriptionJob,
  isTranscriptionJobTerminal,
  recordTranscriptionJobEvent,
  serializeServerSentEvent,
} from "../src/transcription-job.mjs";

describe("transcription job", () => {
  it("starts as a running queued job", () => {
    assert.deepEqual(createTranscriptionJob("job-1", "2026-08-19T00:00:00.000Z"), {
      id: "job-1",
      status: "running",
      stage: "queued",
      message: "等待處理",
      percent: 0,
      events: [],
      result: null,
      error: null,
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:00:00.000Z",
    });
  });

  it("records progress events and clamps percentages", () => {
    const job = createTranscriptionJob("job-1");
    const event = recordTranscriptionJobEvent(job, {
      stage: "extracting-audio",
      message: "正在抽出音訊",
      percent: 28.5,
    });

    assert.equal(event.id, 1);
    assert.equal(event.percent, 29);
    assert.equal(job.stage, "extracting-audio");
    assert.equal(job.events.length, 1);
    assert.equal(isTranscriptionJobTerminal(job), false);
  });

  it("marks jobs completed when a complete event is recorded", () => {
    const job = createTranscriptionJob("job-1");
    const result = { segments: [{ text: "完成" }] };
    recordTranscriptionJobEvent(job, {
      stage: "complete",
      message: "完成",
      percent: 100,
      result,
    });

    assert.equal(job.status, "completed");
    assert.equal(job.result, result);
    assert.equal(isTranscriptionJobTerminal(job), true);
  });

  it("serializes events as server-sent events", () => {
    assert.equal(
      serializeServerSentEvent({ id: 2, stage: "complete", message: "完成", percent: 100 }),
      'id: 2\ndata: {"id":2,"stage":"complete","message":"完成","percent":100}\n\n',
    );
  });
});
