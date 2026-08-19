import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAudioChunkArgs,
  createChunkCacheFileName,
  createChunkPlan,
  createEmptyChunkCache,
  defaultChunkSeconds,
  mergeChunkResults,
  offsetSegments,
  recordCompletedChunk,
  restoreCompletedChunkResults,
  shouldChunkTranscription,
} from "./chunked-transcription.mjs";
import { findCommand } from "./command-path.mjs";
import {
  createAudioExtractionArgs,
  createExtractedAudioFileName,
  extractedAudioContentType,
  shouldExtractAudio,
} from "./media-upload.mjs";
import {
  createOfflineEngineReport,
  createWhisperCppArgs,
  createWhisperCppWavArgs,
} from "./offline-transcription.mjs";
import {
  createTranscriptionJob,
  isTranscriptionJobTerminal,
  recordTranscriptionJobEvent,
  serializeServerSentEvent,
} from "./transcription-job.mjs";
import { parseSubtitleFile } from "../public/subtitle-file.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = join(rootDir, "public");
const transcriptionCacheDir = join(rootDir, ".autosub-work", "transcriptions");
const maxUploadBytes = 512 * 1024 * 1024;
const transcriptionJobs = new Map();
const jobRetentionMs = 15 * 60 * 1000;

loadLocalEnv();

const cliOptions = parseCliOptions(process.argv.slice(2));
const requestedPort = cliOptions.port ?? parsePort(process.env.PORT, 0);
let serverUrl = `http://127.0.0.1:${requestedPort || 0}`;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
]);

const server = createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url ?? "/", serverUrl);

    if (req.method === "GET" && req.url === "/api/health") {
      const offlineReport = await createOfflineEngineReport();
      const whisperCpp = getWhisperCppEngine(offlineReport);
      sendJson(res, 200, {
        ok: true,
        hasApiKey: Boolean(process.env.OPENAI_API_KEY),
        hasFfmpeg: Boolean(await findCommand("ffmpeg")),
        transcriptionEngines: {
          cloud: {
            id: "cloud",
            label: "OpenAI 雲端",
            ready: Boolean(process.env.OPENAI_API_KEY),
          },
          offline: {
            id: "offline",
            label: "本機離線",
            ready: whisperCpp?.status === "ready",
            status: whisperCpp?.status ?? "missing-command",
            engine: whisperCpp
              ? {
                  id: whisperCpp.id,
                  label: whisperCpp.label,
                  commandPath: whisperCpp.commandPath,
                  modelPath: whisperCpp.modelPath,
                }
              : null,
          },
        },
        port: getCurrentPort(),
        url: serverUrl,
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/transcribe-jobs") {
      await handleCreateTranscriptionJob(req, res);
      return;
    }

    const jobEventsMatch = requestUrl.pathname.match(/^\/api\/transcribe-jobs\/([^/]+)\/events$/);
    if (req.method === "GET" && jobEventsMatch) {
      handleTranscriptionJobEvents(decodeURIComponent(jobEventsMatch[1]), req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/transcribe") {
      await handleTranscribe(req, res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/shutdown") {
      handleShutdown(res);
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, {
      error: "Unexpected server error",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(requestedPort, "127.0.0.1", () => {
  const actualPort = getCurrentPort();
  serverUrl = `http://127.0.0.1:${actualPort}`;
  console.log(`AutoSub is running at ${serverUrl}`);
  console.log("Close this window or press Ctrl+C to stop AutoSub.");
  writeServerInfo(actualPort, serverUrl);
  if (cliOptions.open) openBrowser(serverUrl);
});

async function handleTranscribe(req, res) {
  const engine = parseTranscriptionEngine(req.headers["x-transcription-engine"]);
  const apiKey = process.env.OPENAI_API_KEY;
  if (engine === "cloud" && !apiKey) {
    sendJson(res, 400, {
      error: "Missing OPENAI_API_KEY",
      detail: "Create .env.local with OPENAI_API_KEY=sk-...",
    });
    return;
  }

  if (engine === "offline") {
    const offlineError = await createOfflineReadinessError();
    if (offlineError) {
      sendJson(res, 400, offlineError);
      return;
    }
  }

  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > maxUploadBytes) {
    sendJson(res, 413, {
      error: "File too large",
      detail: "The current local MVP accepts files up to 512 MB.",
    });
    return;
  }

  const contentType = req.headers["content-type"] || "application/octet-stream";
  const fileName = sanitizeFileName(decodeURIComponent(String(req.headers["x-file-name"] || "media.mp4")));
  const model = String(req.headers["x-transcription-model"] || "whisper-1");
  const prompt = String(req.headers["x-transcription-prompt"] || "請以台灣繁體中文轉錄，保留自然標點，專有名詞盡量使用原文。");
  const projectKey = decodeHeaderValue(req.headers["x-project-key"]) || `${fileName}:${contentLength}`;
  const mediaDuration = parsePositiveNumber(req.headers["x-media-duration"]);
  const chunkSeconds = parsePositiveNumber(req.headers["x-chunk-seconds"]) ?? defaultChunkSeconds;
  const buffer = await readRequestBody(req, maxUploadBytes);

  if (buffer.byteLength === 0) {
    sendJson(res, 400, { error: "Empty upload" });
    return;
  }

  try {
    sendJson(
      res,
      200,
      await createTranscriptionResult({
        apiKey,
        buffer,
        contentType,
        fileName,
        model,
        prompt,
        projectKey,
        mediaDuration,
        chunkSeconds,
        engine,
      }),
    );
  } catch (error) {
    sendJson(res, error?.statusCode ?? 500, createErrorPayload(error));
  }
}

async function handleCreateTranscriptionJob(req, res) {
  const engine = parseTranscriptionEngine(req.headers["x-transcription-engine"]);
  const apiKey = process.env.OPENAI_API_KEY;
  if (engine === "cloud" && !apiKey) {
    sendJson(res, 400, {
      error: "Missing OPENAI_API_KEY",
      detail: "Create .env.local with OPENAI_API_KEY=sk-...",
    });
    return;
  }

  if (engine === "offline") {
    const offlineError = await createOfflineReadinessError();
    if (offlineError) {
      sendJson(res, 400, offlineError);
      return;
    }
  }

  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > maxUploadBytes) {
    sendJson(res, 413, {
      error: "File too large",
      detail: "The current local MVP accepts files up to 512 MB.",
    });
    return;
  }

  const contentType = req.headers["content-type"] || "application/octet-stream";
  const fileName = sanitizeFileName(decodeURIComponent(String(req.headers["x-file-name"] || "media.mp4")));
  const model = String(req.headers["x-transcription-model"] || "whisper-1");
  const prompt = String(req.headers["x-transcription-prompt"] || "請以台灣繁體中文轉錄，保留自然標點，專有名詞盡量使用原文。");
  const projectKey = decodeHeaderValue(req.headers["x-project-key"]) || `${fileName}:${contentLength}`;
  const mediaDuration = parsePositiveNumber(req.headers["x-media-duration"]);
  const chunkSeconds = parsePositiveNumber(req.headers["x-chunk-seconds"]) ?? defaultChunkSeconds;
  const buffer = await readRequestBody(req, maxUploadBytes);

  if (buffer.byteLength === 0) {
    sendJson(res, 400, { error: "Empty upload" });
    return;
  }

  const job = createTranscriptionJob(randomUUID());
  job.listeners = new Set();
  transcriptionJobs.set(job.id, job);
  publishTranscriptionJobEvent(job, {
    stage: "queued",
    message: "轉錄工作已建立，等待本機 server 處理...",
    percent: 5,
  });

  sendJson(res, 202, {
    jobId: job.id,
    eventsUrl: `/api/transcribe-jobs/${encodeURIComponent(job.id)}/events`,
  });

  processTranscriptionJob(job, { apiKey, buffer, contentType, fileName, model, prompt, projectKey, mediaDuration, chunkSeconds, engine });
}

function handleTranscriptionJobEvents(jobId, req, res) {
  const job = transcriptionJobs.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "Transcription job not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });
  res.write(": connected\n\n");

  const writeEvent = (event) => {
    res.write(serializeServerSentEvent(event));
  };

  for (const event of job.events) writeEvent(event);

  if (isTranscriptionJobTerminal(job)) {
    res.end();
    return;
  }

  job.listeners.add(writeEvent);
  const keepAlive = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);
  keepAlive.unref?.();

  req.on("close", () => {
    clearInterval(keepAlive);
    job.listeners.delete(writeEvent);
  });
}

async function processTranscriptionJob(job, options) {
  try {
    const result = await createTranscriptionResult({
      ...options,
      publish: (event) => publishTranscriptionJobEvent(job, event),
    });
    publishTranscriptionJobEvent(job, {
      stage: "complete",
      message: `完成：產生 ${result.segments.length} 段字幕。`,
      percent: 100,
      result,
    });
  } catch (error) {
    publishTranscriptionJobEvent(job, {
      stage: "failed",
      message: error instanceof Error ? error.message : String(error),
      percent: job.percent || 100,
      error: createErrorPayload(error),
    });
  } finally {
    scheduleTranscriptionJobCleanup(job.id);
  }
}

function publishTranscriptionJobEvent(job, event) {
  const recordedEvent = recordTranscriptionJobEvent(job, event);
  for (const listener of job.listeners ?? []) listener(recordedEvent);
  return recordedEvent;
}

function scheduleTranscriptionJobCleanup(jobId) {
  const timer = setTimeout(() => {
    transcriptionJobs.delete(jobId);
  }, jobRetentionMs);
  timer.unref?.();
}

async function createTranscriptionResult({
  apiKey,
  buffer,
  contentType,
  fileName,
  model,
  prompt,
  projectKey,
  mediaDuration,
  chunkSeconds = defaultChunkSeconds,
  engine = "cloud",
  publish = () => {},
}) {
  publish({
    stage: "preparing",
    message: "正在準備檔案...",
    percent: 12,
  });

  if (engine === "offline") {
    return createOfflineWhisperCppTranscriptionResult({
      buffer,
      contentType,
      fileName,
      prompt,
      publish,
    });
  }

  const extractsAudio = shouldExtractAudio({ contentType, fileName });
  publish({
    stage: extractsAudio ? "extracting-audio" : "preparing-audio",
    message: extractsAudio ? "正在用 ffmpeg 抽出低流量音訊..." : "音訊檔已準備完成...",
    percent: extractsAudio ? 30 : 35,
  });

  const upload = await prepareTranscriptionUpload({ buffer, contentType, fileName });
  const uploadMetadata = getUploadMetadata(upload);

  if (shouldChunkTranscription(mediaDuration, chunkSeconds)) {
    return createChunkedTranscriptionResult({
      apiKey,
      upload,
      uploadMetadata,
      fileName,
      model,
      prompt,
      projectKey,
      mediaDuration,
      chunkSeconds,
      publish,
    });
  }

  publish({
    stage: "uploading-openai",
    message: "正在送 OpenAI 辨識並產生時間碼...",
    percent: 60,
    upload: uploadMetadata,
  });

  const payload = await callOpenAiTranscription({ apiKey, upload, model, prompt });
  publish({
    stage: "building-subtitles",
    message: "正在把轉錄結果轉成可編輯字幕...",
    percent: 90,
    upload: uploadMetadata,
  });

  const segments = normalizeSegments(payload);
  return {
    text: payload.text ?? segments.map((segment) => segment.text).join(" "),
    language: payload.language ?? "zh",
    duration: payload.duration ?? null,
    model,
    upload: uploadMetadata,
    segments,
  };
}

async function createChunkedTranscriptionResult({
  apiKey,
  upload,
  uploadMetadata,
  fileName,
  model,
  prompt,
  projectKey,
  mediaDuration,
  chunkSeconds,
  publish,
}) {
  const chunks = createChunkPlan(mediaDuration, chunkSeconds);
  const cachePath = join(
    transcriptionCacheDir,
    createChunkCacheFileName({
      projectKey,
      fileName,
      fileSize: uploadMetadata.originalBytes,
      model,
      chunkSeconds,
    }),
  );
  const cache =
    (await readJsonFile(cachePath)) ??
    createEmptyChunkCache({
      projectKey,
      fileName,
      fileSize: uploadMetadata.originalBytes,
      model,
      chunkSeconds,
      chunks,
    });
  const chunkResults = restoreCompletedChunkResults(cache, chunks);
  const completedCount = chunkResults.filter(Boolean).length;

  publish({
    stage: completedCount > 0 ? "resuming-chunks" : "splitting-audio",
    message:
      completedCount > 0
        ? `已找到 ${completedCount}/${chunks.length} 段暫存結果，將從未完成段落續跑...`
        : `長影片將分成 ${chunks.length} 段轉錄，每段完成後會保存結果...`,
    percent: 38,
    upload: uploadMetadata,
  });

  if (completedCount === chunks.length) {
    publish({
      stage: "building-subtitles",
      message: "已接回所有分段結果，正在合併字幕...",
      percent: 90,
      upload: uploadMetadata,
    });
    return createMergedChunkTranscriptionResult({ chunkResults, mediaDuration, model, uploadMetadata, chunks, chunkSeconds });
  }

  const ffmpeg = await findCommand("ffmpeg");
  if (!ffmpeg) {
    throw new Error("找不到 ffmpeg，請先安裝 ffmpeg 或改用音訊檔上傳。");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "autosub-chunks-"));
  const inputPath = join(tempDir, upload.fileName);

  try {
    await writeFile(inputPath, upload.buffer);
    for (const chunk of chunks) {
      if (chunkResults[chunk.index]) continue;

      const displayIndex = chunk.index + 1;
      const chunkPath = join(tempDir, `chunk-${String(displayIndex).padStart(3, "0")}.mp3`);
      publish({
        stage: "splitting-audio",
        message: `正在準備第 ${displayIndex}/${chunks.length} 段音訊...`,
        percent: getChunkProgressPercent(chunk.index, chunks.length, 40, 50),
        upload: uploadMetadata,
      });
      await run(ffmpeg, createAudioChunkArgs(inputPath, chunkPath, chunk));

      const chunkUpload = {
        extractedAudio: true,
        fileName: createChunkUploadFileName(fileName, displayIndex),
        contentType: extractedAudioContentType,
        originalBytes: uploadMetadata.originalBytes,
        uploadedBytes: (await stat(chunkPath)).size,
        buffer: await readFile(chunkPath),
      };
      publish({
        stage: "transcribing-chunk",
        message: `正在送 OpenAI 轉錄第 ${displayIndex}/${chunks.length} 段...`,
        percent: getChunkProgressPercent(chunk.index, chunks.length, 50, 85),
        upload: getUploadMetadata(chunkUpload),
      });

      const payload = await callOpenAiTranscription({ apiKey, upload: chunkUpload, model, prompt });
      const chunkSegments = offsetSegments(normalizeSegments(payload), chunk.start);
      const chunkResult = {
        text: payload.text ?? chunkSegments.map((segment) => segment.text).join(" "),
        language: payload.language ?? "zh",
        duration: payload.duration ?? chunk.duration,
        segments: chunkSegments,
      };
      chunkResults[chunk.index] = chunkResult;
      recordCompletedChunk(cache, chunk, chunkResult);
      await writeJsonFile(cachePath, cache);
    }
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }

  publish({
    stage: "building-subtitles",
    message: "正在合併分段轉錄結果並建立字幕...",
    percent: 90,
    upload: uploadMetadata,
  });

  return createMergedChunkTranscriptionResult({ chunkResults, mediaDuration, model, uploadMetadata, chunks, chunkSeconds });
}

async function createOfflineWhisperCppTranscriptionResult({ buffer, contentType, fileName, prompt, publish }) {
  const offlineReport = await createOfflineEngineReport();
  const whisperCpp = getWhisperCppEngine(offlineReport);
  if (whisperCpp?.status !== "ready") {
    throw new Error(createOfflineReadinessDetail(whisperCpp));
  }

  const ffmpeg = await findCommand("ffmpeg");
  if (!ffmpeg) {
    throw new Error("找不到 ffmpeg，離線轉錄需要先把媒體轉成 whisper.cpp 使用的 WAV。");
  }

  publish({
    stage: "preparing-offline-audio",
    message: "正在準備 whisper.cpp 使用的 16 kHz mono WAV...",
    percent: 35,
  });

  const tempDir = await mkdtemp(join(tmpdir(), "autosub-offline-"));
  const inputPath = join(tempDir, fileName);
  const wavPath = join(tempDir, "offline-input.wav");
  const outputBasePath = join(tempDir, "offline-result");

  try {
    await writeFile(inputPath, buffer);
    await run(ffmpeg, createWhisperCppWavArgs(inputPath, wavPath));

    publish({
      stage: "transcribing-offline",
      message: "正在使用 whisper.cpp 本機離線轉錄...",
      percent: 65,
      upload: {
        offline: true,
        extractedAudio: shouldExtractAudio({ contentType, fileName }),
        fileName: "offline-input.wav",
        contentType: "audio/wav",
        originalBytes: buffer.byteLength,
        uploadedBytes: (await stat(wavPath)).size,
      },
    });

    await run(
      whisperCpp.commandPath,
      createWhisperCppArgs({
        modelPath: whisperCpp.modelPath,
        audioPath: wavPath,
        outputBasePath,
        language: "zh",
        prompt,
      }),
    );

    publish({
      stage: "building-subtitles",
      message: "正在匯入 whisper.cpp 產生的字幕...",
      percent: 90,
    });

    const srt = await readFile(`${outputBasePath}.srt`, "utf8");
    const segments = parseSubtitleFile(srt).map((segment, index) => ({
      ...segment,
      id: crypto.randomUUID(),
      index: index + 1,
    }));

    return {
      text: segments.map((segment) => segment.text).join(" "),
      language: "zh",
      duration: segments.at(-1)?.end ?? null,
      model: "whisper.cpp",
      upload: {
        offline: true,
        engine: whisperCpp.label,
        modelPath: whisperCpp.modelPath,
        extractedAudio: shouldExtractAudio({ contentType, fileName }),
        fileName: "offline-input.wav",
        contentType: "audio/wav",
        originalBytes: buffer.byteLength,
        uploadedBytes: (await stat(wavPath)).size,
      },
      segments,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

async function callOpenAiTranscription({ apiKey, upload, model, prompt }) {
  const body = new FormData();
  body.append("file", new Blob([upload.buffer], { type: upload.contentType }), upload.fileName);
  body.append("model", model);
  body.append("language", "zh");
  body.append("prompt", prompt);

  if (model === "whisper-1") {
    body.append("response_format", "verbose_json");
    body.append("timestamp_granularities[]", "segment");
  } else {
    body.append("response_format", "json");
  }

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  const responseText = await response.text();
  if (!response.ok) {
    const error = new Error("OpenAI transcription failed");
    error.statusCode = response.status;
    error.detail = safeJsonOrText(responseText);
    throw error;
  }

  return JSON.parse(responseText);
}

function createErrorPayload(error) {
  return {
    error: error?.message ?? "Transcription failed",
    detail: error?.detail ?? (error instanceof Error ? error.message : String(error)),
  };
}

function createMergedChunkTranscriptionResult({ chunkResults, mediaDuration, model, uploadMetadata, chunks, chunkSeconds }) {
  const merged = mergeChunkResults(chunkResults);
  return {
    text: merged.text,
    language: merged.language,
    duration: mediaDuration,
    model,
    upload: {
      ...uploadMetadata,
      chunked: true,
      chunks: chunks.length,
      chunkSeconds,
    },
    segments: merged.segments,
  };
}

function getChunkProgressPercent(index, total, start, end) {
  if (total <= 0) return start;
  return start + ((end - start) * index) / total;
}

function createChunkUploadFileName(fileName, index) {
  const baseName = createExtractedAudioFileName(fileName).replace(/\.[^.]*$/, "");
  return `${baseName}-part-${String(index).padStart(3, "0")}.mp3`;
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    return null;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function getWhisperCppEngine(report) {
  return report?.engines?.find((engine) => engine.id === "whisper-cpp") ?? null;
}

async function createOfflineReadinessError() {
  const report = await createOfflineEngineReport();
  const whisperCpp = getWhisperCppEngine(report);
  if (whisperCpp?.status === "ready") return null;

  return {
    error: "Offline transcription is not ready",
    detail: createOfflineReadinessDetail(whisperCpp),
  };
}

function createOfflineReadinessDetail(whisperCpp) {
  if (whisperCpp?.status === "needs-model") {
    return `已找到 whisper.cpp，但尚未設定 ${whisperCpp.modelEnv}。`;
  }

  return "尚未安裝 whisper.cpp，請先執行 npm run offline:install-whisper-cpp，或設定 AUTOSUB_WHISPER_CPP_CLI 與 AUTOSUB_WHISPER_CPP_MODEL。";
}

function getUploadMetadata(upload) {
  return {
    extractedAudio: upload.extractedAudio,
    fileName: upload.fileName,
    contentType: upload.contentType,
    originalBytes: upload.originalBytes,
    uploadedBytes: upload.uploadedBytes,
  };
}

async function prepareTranscriptionUpload({ buffer, contentType, fileName }) {
  if (!shouldExtractAudio({ contentType, fileName })) {
    return {
      extractedAudio: false,
      fileName,
      contentType,
      originalBytes: buffer.byteLength,
      uploadedBytes: buffer.byteLength,
      buffer,
    };
  }

  const ffmpeg = await findCommand("ffmpeg");
  if (!ffmpeg) {
    throw new Error("找不到 ffmpeg，請先安裝 ffmpeg 或改用音訊檔上傳。");
  }

  const tempDir = await mkdtemp(join(tmpdir(), "autosub-"));
  const inputPath = join(tempDir, fileName);
  const outputFileName = createExtractedAudioFileName(fileName);
  const outputPath = join(tempDir, outputFileName);

  try {
    await writeFile(inputPath, buffer);
    await run(ffmpeg, createAudioExtractionArgs(inputPath, outputPath));
    const audioBuffer = await readFile(outputPath);
    return {
      extractedAudio: true,
      fileName: outputFileName,
      contentType: extractedAudioContentType,
      originalBytes: buffer.byteLength,
      uploadedBytes: audioBuffer.byteLength,
      buffer: audioBuffer,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }

      rejectRun(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

function normalizeSegments(payload) {
  if (Array.isArray(payload.segments) && payload.segments.length > 0) {
    return payload.segments
      .map((segment, index) => ({
        id: crypto.randomUUID(),
        index: index + 1,
        start: Number(segment.start ?? 0),
        end: Math.max(Number(segment.end ?? 0), Number(segment.start ?? 0)),
        text: String(segment.text ?? "").trim(),
      }))
      .filter((segment) => segment.text.length > 0);
  }

  const text = String(payload.text ?? "").trim();
  return text
    ? [
        {
          id: crypto.randomUUID(),
          index: 1,
          start: 0,
          end: 0,
          text,
        },
      ]
    : [];
}

async function serveStatic(req, res) {
  const url = new URL(req.url ?? "/", serverUrl);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = resolve(publicDir, normalize(decodeURIComponent(requestedPath)).replace(/^([/\\])+/, ""));

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  if (!existsSync(filePath)) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": mimeTypes.get(extname(filePath)) ?? "application/octet-stream",
    "Content-Length": fileStat.size,
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}

function readRequestBody(req, limitBytes) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.byteLength;
      if (total > limitBytes) {
        req.destroy(new Error("Upload exceeded limit"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolveBody(Buffer.concat(chunks)));
    req.on("error", rejectBody);
  });
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function handleShutdown(res) {
  sendJson(res, 200, {
    ok: true,
    message: "AutoSub is shutting down.",
  });

  setTimeout(() => {
    server.close(() => {
      console.log("AutoSub stopped.");
      process.exit(0);
    });
  }, 250);
}

function sanitizeFileName(value) {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return cleaned || "media.mp4";
}

function safeJsonOrText(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function loadLocalEnv() {
  for (const name of [".env.local", ".env"]) {
    const envPath = join(rootDir, name);
    if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
      process.loadEnvFile(envPath);
    }
  }
}

function parseCliOptions(args) {
  const options = {
    open: false,
    port: undefined,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--open") {
      options.open = true;
      continue;
    }

    if (arg === "--port") {
      options.port = parsePort(args[index + 1], 0);
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      options.port = parsePort(arg.slice("--port=".length), 0);
    }
  }

  return options;
}

function parsePort(value, fallback) {
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535 ? parsed : fallback;
}

function decodeHeaderValue(value) {
  if (value == null || value === "") return "";
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
}

function parsePositiveNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTranscriptionEngine(value) {
  return String(value ?? "").toLowerCase() === "offline" ? "offline" : "cloud";
}

function getCurrentPort() {
  const address = server.address();
  return typeof address === "object" && address ? address.port : requestedPort;
}

function writeServerInfo(actualPort, url) {
  const infoPath = join(rootDir, ".autosub-server.json");
  const payload = JSON.stringify(
    {
      port: actualPort,
      url,
      startedAt: new Date().toISOString(),
    },
    null,
    2,
  );
  writeFile(infoPath, `${payload}\n`, "utf8").catch((error) => {
    console.warn(`Could not write ${infoPath}: ${error.message}`);
  });
}

function openBrowser(url) {
  const command =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  const child = spawn(command[0], command[1], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
