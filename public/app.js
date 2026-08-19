const mediaInput = document.querySelector("#mediaInput");
const mediaPlayer = document.querySelector("#mediaPlayer");
const transcribeButton = document.querySelector("#transcribeButton");
const exportButton = document.querySelector("#exportButton");
const statusText = document.querySelector("#statusText");
const timeText = document.querySelector("#timeText");
const captionOverlay = document.querySelector("#captionOverlay");
const segmentsList = document.querySelector("#segmentsList");
const emptyState = document.querySelector("#emptyState");
const segmentCount = document.querySelector("#segmentCount");

let selectedFile = null;
let mediaUrl = null;
let segments = [];
let activeSegmentId = null;

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files?.[0];
  if (!file) return;

  selectedFile = file;
  segments = [];
  activeSegmentId = null;

  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = URL.createObjectURL(file);
  mediaPlayer.src = mediaUrl;

  transcribeButton.disabled = false;
  exportButton.disabled = true;
  setStatus(`已選擇 ${file.name}，可以開始產生字幕。`);
  renderSegments();
  updateActiveCaption();
});

transcribeButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  transcribeButton.disabled = true;
  exportButton.disabled = true;
  setStatus("正在上傳到本機 server，準備送 OpenAI 轉錄...");

  try {
    const response = await fetch("/api/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": selectedFile.type || "application/octet-stream",
        "X-File-Name": encodeURIComponent(selectedFile.name),
        "X-Transcription-Model": "whisper-1",
      },
      body: selectedFile,
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(formatApiError(payload));
    }

    segments = payload.segments.map((segment) => ({ ...segment }));
    setStatus(`完成：產生 ${segments.length} 段字幕。`);
    exportButton.disabled = segments.length === 0;
    renderSegments();
    updateActiveCaption();
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    transcribeButton.disabled = !selectedFile;
  }
});

exportButton.addEventListener("click", () => {
  if (segments.length === 0) return;

  const srt = toSrt(segments);
  const baseName = selectedFile ? selectedFile.name.replace(/\.[^.]+$/, "") : "autosub";
  const blob = new Blob([srt], { type: "application/x-subrip;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}.srt`;
  link.click();
  URL.revokeObjectURL(url);
});

mediaPlayer.addEventListener("timeupdate", () => {
  timeText.textContent = formatClock(mediaPlayer.currentTime);
  updateActiveCaption();
});

mediaPlayer.addEventListener("seeked", updateActiveCaption);

function renderSegments() {
  segmentCount.textContent = `${segments.length} 段`;
  emptyState.hidden = segments.length > 0;
  segmentsList.innerHTML = "";

  for (const segment of segments) {
    const item = document.createElement("li");
    item.className = "segment";
    item.dataset.id = segment.id;

    const timeBox = document.createElement("div");
    timeBox.className = "time-box";

    const jumpButton = document.createElement("button");
    jumpButton.type = "button";
    jumpButton.textContent = formatShortTime(segment.start);
    jumpButton.addEventListener("click", () => {
      mediaPlayer.currentTime = Math.max(0, segment.start);
      mediaPlayer.play().catch(() => {});
    });

    const startInput = createTimeInput(segment.start, (value) => {
      segment.start = clampTime(value, 0, segment.end);
      renderSegments();
      updateActiveCaption();
    });

    const endInput = createTimeInput(segment.end, (value) => {
      segment.end = Math.max(value, segment.start);
      renderSegments();
      updateActiveCaption();
    });

    timeBox.append(jumpButton, startInput, endInput);

    const contentBox = document.createElement("div");
    const textarea = document.createElement("textarea");
    textarea.value = segment.text;
    textarea.addEventListener("input", () => {
      segment.text = textarea.value;
      updateActiveCaption();
    });

    const tools = document.createElement("div");
    tools.className = "segment-tools";

    const duration = document.createElement("span");
    duration.textContent = `${formatDuration(segment.end - segment.start)}`;
    if (segment.end <= segment.start) duration.className = "warning";

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", () => {
      segments = segments.filter((candidate) => candidate.id !== segment.id);
      renderSegments();
      updateActiveCaption();
      exportButton.disabled = segments.length === 0;
    });

    tools.append(duration, deleteButton);
    contentBox.append(textarea, tools);
    item.append(timeBox, contentBox);
    segmentsList.append(item);
  }

  markActiveSegment();
}

function createTimeInput(value, onChange) {
  const input = document.createElement("input");
  input.className = "time-input";
  input.value = formatClock(value);
  input.inputMode = "decimal";
  input.addEventListener("change", () => onChange(parseTime(input.value)));
  return input;
}

function updateActiveCaption() {
  const time = mediaPlayer.currentTime || 0;
  const active = segments.find((segment) => time >= segment.start && time <= segment.end);
  activeSegmentId = active?.id ?? null;
  captionOverlay.innerHTML = active ? `<span>${escapeHtml(active.text)}</span>` : "";
  markActiveSegment();
}

function markActiveSegment() {
  for (const item of segmentsList.querySelectorAll(".segment")) {
    item.classList.toggle("is-active", item.dataset.id === activeSegmentId);
  }
}

function setStatus(message, isWarning = false) {
  statusText.textContent = message;
  statusText.classList.toggle("warning", isWarning);
}

function toSrt(items) {
  return items
    .map((segment, index) => {
      return [
        String(index + 1),
        `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
        segment.text.trim(),
      ].join("\n");
    })
    .join("\n\n");
}

function formatSrtTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

function formatClock(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60);
  return `${pad(m)}:${pad(s)}.${String(ms).padStart(3, "0")}`;
}

function formatShortTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(totalSeconds / 60))}:${pad(totalSeconds % 60)}`;
}

function parseTime(value) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const parts = trimmed.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return 0;

  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0];
}

function clampTime(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatDuration(seconds) {
  return `${Math.max(0, seconds).toFixed(2)} 秒`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

function formatApiError(payload) {
  if (payload?.detail?.error?.message) return payload.detail.error.message;
  if (payload?.detail && typeof payload.detail === "string") return payload.detail;
  if (payload?.error) return payload.error;
  return "轉錄失敗。";
}
