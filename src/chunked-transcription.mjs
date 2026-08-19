import { createHash } from "node:crypto";

export const defaultChunkSeconds = 300;
export const defaultChunkThresholdSeconds = 300;

export function shouldChunkTranscription(durationSeconds, thresholdSeconds = defaultChunkThresholdSeconds) {
  const duration = Number(durationSeconds);
  return Number.isFinite(duration) && duration > thresholdSeconds;
}

export function createChunkPlan(durationSeconds, chunkSeconds = defaultChunkSeconds) {
  const duration = Number(durationSeconds);
  const chunkSize = Number(chunkSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(chunkSize) || chunkSize <= 0) return [];

  const chunks = [];
  for (let start = 0; start < duration; start += chunkSize) {
    const end = Math.min(duration, start + chunkSize);
    chunks.push({
      index: chunks.length,
      start,
      end,
      duration: end - start,
    });
  }
  return chunks;
}

export function createAudioChunkArgs(inputPath, outputPath, chunk) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(chunk.start),
    "-i",
    inputPath,
    "-t",
    String(chunk.duration),
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-b:a",
    "64k",
    outputPath,
  ];
}

export function offsetSegments(segments, offsetSeconds) {
  const offset = Number(offsetSeconds) || 0;
  return segments.map((segment) => ({
    ...segment,
    start: Number(segment.start) + offset,
    end: Number(segment.end) + offset,
  }));
}

export function mergeChunkResults(chunkResults) {
  const segments = chunkResults
    .filter(Boolean)
    .flatMap((chunkResult) => chunkResult.segments ?? [])
    .sort((left, right) => left.start - right.start)
    .map((segment, index) => ({
      ...segment,
      index: index + 1,
    }));

  return {
    text: chunkResults
      .filter(Boolean)
      .map((chunkResult) => String(chunkResult.text ?? "").trim())
      .filter(Boolean)
      .join(" "),
    language: chunkResults.find((chunkResult) => chunkResult?.language)?.language ?? "zh",
    segments,
  };
}

export function createChunkCacheFileName({ projectKey, fileName, fileSize, model, chunkSeconds }) {
  const hash = createHash("sha256")
    .update(
      JSON.stringify({
        projectKey: projectKey || null,
        fileName,
        fileSize,
        model,
        chunkSeconds,
      }),
    )
    .digest("hex")
    .slice(0, 24);

  return `${hash}.json`;
}

export function createEmptyChunkCache({ projectKey, fileName, fileSize, model, chunkSeconds, chunks }) {
  return {
    version: 1,
    projectKey,
    fileName,
    fileSize,
    model,
    chunkSeconds,
    chunks: chunks.map((chunk) => ({
      ...chunk,
      status: "pending",
      result: null,
      completedAt: null,
    })),
    updatedAt: null,
  };
}

export function restoreCompletedChunkResults(cache, chunks) {
  if (!cache || cache.version !== 1 || !Array.isArray(cache.chunks)) return [];

  return chunks.map((chunk) => {
    const cached = cache.chunks.find((candidate) => candidate.index === chunk.index);
    return cached?.status === "completed" ? cached.result : null;
  });
}

export function recordCompletedChunk(cache, chunk, result, now = new Date().toISOString()) {
  const entry = cache.chunks.find((candidate) => candidate.index === chunk.index);
  if (!entry) return cache;

  entry.status = "completed";
  entry.result = result;
  entry.completedAt = now;
  cache.updatedAt = now;
  return cache;
}
