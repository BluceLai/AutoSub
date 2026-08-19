import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const publicDir = join(rootDir, "public");
const maxUploadBytes = 512 * 1024 * 1024;

loadLocalEnv();

const port = Number(process.env.PORT ?? 3000);

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
    if (req.method === "GET" && req.url === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        hasApiKey: Boolean(process.env.OPENAI_API_KEY),
      });
      return;
    }

    if (req.method === "POST" && req.url === "/api/transcribe") {
      await handleTranscribe(req, res);
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

server.listen(port, () => {
  console.log(`AutoSub is running at http://localhost:${port}`);
});

async function handleTranscribe(req, res) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    sendJson(res, 400, {
      error: "Missing OPENAI_API_KEY",
      detail: "Create .env.local with OPENAI_API_KEY=sk-...",
    });
    return;
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
  const buffer = await readRequestBody(req, maxUploadBytes);

  if (buffer.byteLength === 0) {
    sendJson(res, 400, { error: "Empty upload" });
    return;
  }

  const body = new FormData();
  body.append("file", new Blob([buffer], { type: contentType }), fileName);
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
    sendJson(res, response.status, {
      error: "OpenAI transcription failed",
      detail: safeJsonOrText(responseText),
    });
    return;
  }

  const payload = JSON.parse(responseText);
  const segments = normalizeSegments(payload);
  sendJson(res, 200, {
    text: payload.text ?? segments.map((segment) => segment.text).join(" "),
    language: payload.language ?? "zh",
    duration: payload.duration ?? null,
    model,
    segments,
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
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
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
