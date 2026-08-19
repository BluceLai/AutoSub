export const transcriptionJobTerminalStatuses = new Set(["completed", "failed"]);

export function createTranscriptionJob(id, now = new Date().toISOString()) {
  return {
    id,
    status: "running",
    stage: "queued",
    message: "等待處理",
    percent: 0,
    events: [],
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function recordTranscriptionJobEvent(job, event, now = new Date().toISOString()) {
  const nextEvent = {
    id: job.events.length + 1,
    stage: event.stage,
    message: event.message,
    percent: clampPercent(event.percent),
    result: event.result ?? null,
    error: event.error ?? null,
    upload: event.upload ?? null,
    createdAt: now,
  };

  job.stage = nextEvent.stage;
  job.message = nextEvent.message;
  job.percent = nextEvent.percent;
  job.updatedAt = now;

  if (nextEvent.stage === "complete") {
    job.status = "completed";
    job.result = nextEvent.result;
  } else if (nextEvent.stage === "failed") {
    job.status = "failed";
    job.error = nextEvent.error ?? nextEvent.message;
  }

  job.events.push(nextEvent);
  return nextEvent;
}

export function isTranscriptionJobTerminal(job) {
  return transcriptionJobTerminalStatuses.has(job?.status);
}

export function serializeServerSentEvent(event) {
  return `id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
}

function clampPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(100, Math.round(percent)));
}
