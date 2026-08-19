const mediaInput = document.querySelector("#mediaInput");
const mediaPlayer = document.querySelector("#mediaPlayer");
const projectInput = document.querySelector("#projectInput");
const importProjectButton = document.querySelector("#importProjectButton");
const exportProjectButton = document.querySelector("#exportProjectButton");
const demoButton = document.querySelector("#demoButton");
const transcribeButton = document.querySelector("#transcribeButton");
const exportButton = document.querySelector("#exportButton");
const exportFormat = document.querySelector("#exportFormat");
const shutdownButton = document.querySelector("#shutdownButton");
const statusText = document.querySelector("#statusText");
const keyStatus = document.querySelector("#keyStatus");
const projectStatus = document.querySelector("#projectStatus");
const timeText = document.querySelector("#timeText");
const captionOverlay = document.querySelector("#captionOverlay");
const segmentsList = document.querySelector("#segmentsList");
const emptyState = document.querySelector("#emptyState");
const segmentCount = document.querySelector("#segmentCount");
const addSegmentButton = document.querySelector("#addSegmentButton");
const progressPanel = document.querySelector("#progressPanel");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressTrack = document.querySelector(".progress-track");
const progressBar = document.querySelector("#progressBar");

let selectedFile = null;
let mediaUrl = null;
let segments = [];
let activeSegmentId = null;
let hasApiKey = false;
let currentProjectKey = null;
let saveTimer = null;

checkHealth();

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files?.[0];
  if (!file) return;

  selectedFile = file;
  segments = [];
  activeSegmentId = null;
  currentProjectKey = getProjectKey(file);

  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = URL.createObjectURL(file);
  mediaPlayer.src = mediaUrl;

  const savedProject = loadSavedProject(currentProjectKey);
  if (savedProject) {
    segments = savedProject.segments;
  }

  importProjectButton.disabled = false;
  addSegmentButton.disabled = false;
  exportProjectButton.disabled = segments.length === 0;
  demoButton.disabled = false;
  transcribeButton.disabled = !hasApiKey;
  exportButton.disabled = segments.length === 0;
  exportFormat.disabled = segments.length === 0;
  hideProgress();
  if (savedProject) {
    setStatus(`已接回 ${file.name} 的本機字幕專案。`);
    setProjectStatus(`上次儲存：${formatSavedAt(savedProject.savedAt)}`);
  } else {
    setStatus(hasApiKey ? `已選擇 ${file.name}，可以開始產生字幕。` : `已選擇 ${file.name}。尚未設定 API key，可先載入測試字幕。`);
    setProjectStatus("尚未建立字幕專案");
  }
  renderSegments();
  updateActiveCaption();
});

addSegmentButton.addEventListener("click", () => {
  if (!selectedFile) return;

  const start = clampTime(mediaPlayer.currentTime || 0, 0, getMediaDuration());
  const nextSegment = segments.find((segment) => segment.start > start);
  const endLimit = nextSegment ? Math.max(start + 0.3, nextSegment.start - 0.05) : getMediaDuration();
  const end = Math.max(start + 0.3, Math.min(start + 2, endLimit));

  segments.push({
    id: crypto.randomUUID(),
    index: segments.length + 1,
    start,
    end,
    text: "新增字幕",
  });
  normalizeSegmentOrder();
  enableOutputControls();
  saveProjectNow();
  renderSegments();
  updateActiveCaption();
  setStatus(`已在 ${formatClock(start)} 新增字幕段。`);
});

transcribeButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  transcribeButton.disabled = true;
  transcribeButton.textContent = "處理中...";
  exportButton.disabled = true;
  setProgress("準備上傳", 0);
  setStatus("正在準備檔案...");

  try {
    const payload = await transcribeWithProgress(selectedFile);

    segments = payload.segments.map((segment) => ({ ...segment }));
    normalizeSegmentOrder();
    setProgress("完成", 100);
    setStatus(`完成：產生 ${segments.length} 段字幕。`);
    enableOutputControls();
    saveProjectNow();
    renderSegments();
    updateActiveCaption();
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    transcribeButton.textContent = "產生字幕";
    transcribeButton.disabled = !selectedFile || !hasApiKey;
  }
});

demoButton.addEventListener("click", () => {
  if (!selectedFile) return;

  const duration = Number.isFinite(mediaPlayer.duration) ? mediaPlayer.duration : 20;
  segments = createDemoSegments(Math.min(duration, 20));
  normalizeSegmentOrder();
  setProgress("測試字幕已載入", 100);
  setStatus(`已載入 ${segments.length} 段測試字幕，不會消耗 OpenAI 用量。`);
  enableOutputControls();
  saveProjectNow();
  renderSegments();
  updateActiveCaption();
});

importProjectButton.addEventListener("click", () => {
  projectInput.click();
});

projectInput.addEventListener("change", async () => {
  const file = projectInput.files?.[0];
  projectInput.value = "";
  if (!file || !selectedFile) return;

  try {
    const project = parseProject(await file.text());
    const importedName = project.file?.name;
    if (importedName && importedName !== selectedFile.name) {
      const shouldImport = window.confirm(`這份專案原本對應「${importedName}」，目前影片是「${selectedFile.name}」。仍要匯入嗎？`);
      if (!shouldImport) return;
    }

    segments = project.segments;
    normalizeSegmentOrder();
    enableOutputControls();
    saveProjectNow();
    renderSegments();
    updateActiveCaption();
    setProgress("專案已匯入", 100);
    setStatus(`已匯入 ${segments.length} 段字幕專案。`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "專案匯入失敗。", true);
  }
});

exportProjectButton.addEventListener("click", () => {
  if (!selectedFile || segments.length === 0) return;

  const baseName = selectedFile.name.replace(/\.[^.]+$/, "");
  downloadText(`${baseName}.autosub.json`, JSON.stringify(createProjectPayload(), null, 2), "application/json;charset=utf-8");
});

exportButton.addEventListener("click", () => {
  if (segments.length === 0) return;

  const baseName = selectedFile ? selectedFile.name.replace(/\.[^.]+$/, "") : "autosub";
  const format = exportFormat.value;

  if (format === "vtt") {
    downloadText(`${baseName}.vtt`, toVtt(segments), "text/vtt;charset=utf-8");
  } else if (format === "txt") {
    downloadText(`${baseName}.txt`, toTxt(segments), "text/plain;charset=utf-8");
  } else {
    downloadText(`${baseName}.srt`, toSrt(segments), "application/x-subrip;charset=utf-8");
  }
});

shutdownButton.addEventListener("click", async () => {
  const shouldShutdown = window.confirm("確定要關閉 AutoSub 本機服務嗎？關閉後目前頁面將無法繼續產生字幕。");
  if (!shouldShutdown) return;

  shutdownButton.disabled = true;
  demoButton.disabled = true;
  importProjectButton.disabled = true;
  exportProjectButton.disabled = true;
  addSegmentButton.disabled = true;
  transcribeButton.disabled = true;
  exportButton.disabled = true;
  exportFormat.disabled = true;
  setStatus("正在關閉 AutoSub 本機服務...");

  try {
    await fetch("/api/shutdown", { method: "POST" });
    setStatus("AutoSub 已關閉。需要再使用時，請重新執行 Start AutoSub.cmd 或 npm run dev。");
  } catch {
    setStatus("服務已關閉。需要再使用時，請重新啟動 AutoSub。");
  }
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
    const segmentIndex = segments.findIndex((candidate) => candidate.id === segment.id);
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
      scheduleSaveProject();
      renderSegments();
      updateActiveCaption();
    });

    const endInput = createTimeInput(segment.end, (value) => {
      segment.end = Math.max(value, segment.start);
      scheduleSaveProject();
      renderSegments();
      updateActiveCaption();
    });

    timeBox.append(jumpButton, startInput, endInput);

    const contentBox = document.createElement("div");
    const textarea = document.createElement("textarea");
    textarea.value = segment.text;
    textarea.addEventListener("input", () => {
      segment.text = textarea.value;
      scheduleSaveProject();
      updateActiveCaption();
    });

    const tools = document.createElement("div");
    tools.className = "segment-tools";

    const duration = document.createElement("span");
    duration.textContent = `${formatDuration(segment.end - segment.start)}`;
    if (segment.end <= segment.start) duration.className = "warning";

    const actions = document.createElement("div");
    actions.className = "segment-actions";

    const splitButton = document.createElement("button");
    splitButton.type = "button";
    splitButton.textContent = "拆分";
    splitButton.disabled = segment.end - segment.start < 0.6;
    splitButton.addEventListener("click", () => splitSegment(segment.id));

    const mergeButton = document.createElement("button");
    mergeButton.type = "button";
    mergeButton.textContent = "合併下段";
    mergeButton.disabled = segmentIndex === segments.length - 1;
    mergeButton.addEventListener("click", () => mergeWithNextSegment(segment.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", () => {
      segments = segments.filter((candidate) => candidate.id !== segment.id);
      renderSegments();
      updateActiveCaption();
      enableOutputControls();
      saveProjectNow();
    });

    actions.append(splitButton, mergeButton, deleteButton);
    tools.append(duration, actions);
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

function setProjectStatus(message) {
  projectStatus.textContent = message;
}

function splitSegment(segmentId) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1) return;

  const segment = segments[index];
  const duration = segment.end - segment.start;
  if (duration < 0.6) {
    setStatus("這段太短，至少需要 0.6 秒才能拆分。", true);
    return;
  }

  const playhead = mediaPlayer.currentTime || 0;
  const splitAt =
    playhead > segment.start + 0.2 && playhead < segment.end - 0.2 ? playhead : segment.start + duration / 2;
  const [firstText, secondText] = splitText(segment.text);

  segments.splice(
    index,
    1,
    {
      ...segment,
      end: splitAt,
      text: firstText,
    },
    {
      id: crypto.randomUUID(),
      index: segment.index + 1,
      start: splitAt,
      end: segment.end,
      text: secondText,
    },
  );
  normalizeSegmentOrder();
  saveProjectNow();
  renderSegments();
  updateActiveCaption();
  setStatus(`已在 ${formatClock(splitAt)} 拆分字幕段。`);
}

function mergeWithNextSegment(segmentId) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1 || index >= segments.length - 1) return;

  const current = segments[index];
  const next = segments[index + 1];
  segments.splice(index, 2, {
    ...current,
    end: Math.max(current.end, next.end),
    text: [current.text.trim(), next.text.trim()].filter(Boolean).join(" "),
  });
  normalizeSegmentOrder();
  saveProjectNow();
  renderSegments();
  updateActiveCaption();
  setStatus("已合併下一段字幕。");
}

function splitText(text) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return [trimmed, "新增字幕"];

  const midpoint = Math.ceil(trimmed.length / 2);
  const punctuation = ["，", "。", "、", "；", ",", ".", ";", " "];
  const splitIndex = punctuation
    .flatMap((mark) => [trimmed.indexOf(mark, Math.max(1, midpoint - 6)), trimmed.lastIndexOf(mark, midpoint + 6)])
    .filter((index) => index > 0 && index < trimmed.length - 1)
    .sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint))[0];

  const index = splitIndex ?? midpoint;
  return [trimmed.slice(0, index + 1).trim(), trimmed.slice(index + 1).trim() || "新增字幕"];
}

function normalizeSegmentOrder() {
  segments = segments
    .map((segment) => ({
      ...segment,
      id: segment.id || crypto.randomUUID(),
      start: Math.max(0, Number(segment.start) || 0),
      end: Math.max(Number(segment.end) || 0, Number(segment.start) || 0),
      text: String(segment.text ?? ""),
    }))
    .sort((left, right) => left.start - right.start)
    .map((segment, index) => ({
      ...segment,
      index: index + 1,
    }));
}

function enableOutputControls() {
  const hasSegments = segments.length > 0;
  exportButton.disabled = !hasSegments;
  exportFormat.disabled = !hasSegments;
  exportProjectButton.disabled = !hasSegments;
}

function getMediaDuration() {
  if (Number.isFinite(mediaPlayer.duration) && mediaPlayer.duration > 0) return mediaPlayer.duration;
  const lastEnd = Math.max(0, ...segments.map((segment) => Number(segment.end) || 0));
  return Math.max(lastEnd, (mediaPlayer.currentTime || 0) + 5, 20);
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    hasApiKey = Boolean(health.hasApiKey);
    keyStatus.className = `key-status ${hasApiKey ? "is-ready" : "is-missing"}`;
    keyStatus.textContent = hasApiKey
      ? "OpenAI API key 已設定，可以正式產生字幕"
      : "尚未設定 OpenAI API key；可先用測試字幕模式";
    transcribeButton.disabled = !selectedFile || !hasApiKey;
  } catch {
    keyStatus.className = "key-status is-missing";
    keyStatus.textContent = "無法連線到本機服務";
    transcribeButton.disabled = true;
  }
}

function getProjectKey(file) {
  return `autosub:project:${file.name}:${file.size}:${file.lastModified}`;
}

function loadSavedProject(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return parseProject(raw);
  } catch {
    return null;
  }
}

function scheduleSaveProject() {
  if (!selectedFile || segments.length === 0) return;
  setProjectStatus("儲存中...");
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(saveProjectNow, 350);
}

function saveProjectNow() {
  if (!selectedFile || !currentProjectKey) {
    setProjectStatus("尚未建立字幕專案");
    return;
  }

  if (segments.length === 0) {
    localStorage.removeItem(currentProjectKey);
    setProjectStatus("尚未建立字幕專案");
    return;
  }

  const payload = createProjectPayload();
  localStorage.setItem(currentProjectKey, JSON.stringify(payload));
  setProjectStatus(`已自動儲存 ${formatSavedAt(payload.savedAt)}`);
}

function createProjectPayload() {
  return {
    app: "AutoSub",
    version: 1,
    savedAt: new Date().toISOString(),
    file: selectedFile
      ? {
          name: selectedFile.name,
          size: selectedFile.size,
          lastModified: selectedFile.lastModified,
          type: selectedFile.type,
          duration: Number.isFinite(mediaPlayer.duration) ? mediaPlayer.duration : null,
        }
      : null,
    segments: segments.map((segment, index) => ({
      id: segment.id || crypto.randomUUID(),
      index: index + 1,
      start: Number(segment.start),
      end: Number(segment.end),
      text: String(segment.text ?? ""),
    })),
  };
}

function parseProject(raw) {
  const project = JSON.parse(raw);
  if (project?.app !== "AutoSub" || project?.version !== 1 || !Array.isArray(project.segments)) {
    throw new Error("這不是 AutoSub 專案檔。");
  }

  return {
    ...project,
    segments: project.segments
      .map((segment, index) => ({
        id: typeof segment.id === "string" ? segment.id : crypto.randomUUID(),
        index: index + 1,
        start: Number(segment.start),
        end: Number(segment.end),
        text: String(segment.text ?? "").trim(),
      }))
      .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text),
  };
}

function formatSavedAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "剛剛";
  return date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setProgress(label, percent, options = {}) {
  progressPanel.hidden = false;
  progressLabel.textContent = label;
  progressTrack.classList.toggle("is-indeterminate", Boolean(options.indeterminate));

  if (options.indeterminate) {
    progressPercent.textContent = "處理中";
    progressTrack.removeAttribute("aria-valuenow");
    return;
  }

  const normalized = Math.max(0, Math.min(100, Math.round(percent)));
  progressPercent.textContent = `${normalized}%`;
  progressBar.style.width = `${normalized}%`;
  progressTrack.setAttribute("aria-valuenow", String(normalized));
}

function hideProgress() {
  progressPanel.hidden = true;
  progressTrack.classList.remove("is-indeterminate");
  progressBar.style.width = "0%";
  progressTrack.setAttribute("aria-valuenow", "0");
}

function transcribeWithProgress(file) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/transcribe");
    request.responseType = "json";
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("X-Transcription-Model", "whisper-1");

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const uploadPercent = (event.loaded / event.total) * 65;
        setProgress("上傳到本機 server", uploadPercent);
        setStatus(`上傳中：${Math.round((event.loaded / event.total) * 100)}%`);
      } else {
        setProgress("上傳到本機 server", 18, { indeterminate: true });
        setStatus("正在上傳...");
      }
    });

    request.upload.addEventListener("load", () => {
      setProgress("OpenAI 轉錄中", 70, { indeterminate: true });
      setStatus("上傳完成，OpenAI 正在辨識與產生時間碼...");
    });

    request.addEventListener("load", () => {
      const payload = request.response;
      if (request.status >= 200 && request.status < 300) {
        resolve(payload);
        return;
      }
      reject(new Error(formatApiError(payload)));
    });

    request.addEventListener("error", () => reject(new Error("連線失敗，請確認本機服務仍在執行。")));
    request.addEventListener("abort", () => reject(new Error("轉錄已取消。")));
    request.send(file);
  });
}

function createDemoSegments(duration) {
  const safeDuration = Math.max(8, duration);
  const ranges = [
    [0.6, 4.1, "歡迎使用 AutoSub，這是不用 OpenAI 用量的測試字幕。"],
    [4.4, 8.2, "你可以播放影片，確認字幕會跟著時間顯示。"],
    [8.5, 12.4, "右邊每一段文字和時間碼都可以直接修改。"],
    [12.8, Math.min(18.5, safeDuration), "最後可以選擇 SRT、VTT 或 TXT 匯出。"],
  ];

  return ranges
    .filter(([, startEnd]) => startEnd <= safeDuration)
    .map(([start, end, text], index) => ({
      id: crypto.randomUUID(),
      index: index + 1,
      start,
      end: Math.min(end, safeDuration),
      text,
    }));
}

function downloadText(fileName, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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

function toVtt(items) {
  return `WEBVTT\n\n${items
    .map((segment) => {
      return [`${formatVttTime(segment.start)} --> ${formatVttTime(segment.end)}`, segment.text.trim()].join("\n");
    })
    .join("\n\n")}\n`;
}

function toTxt(items) {
  return `${items.map((segment) => segment.text.trim()).filter(Boolean).join("\n")}\n`;
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

function formatVttTime(seconds) {
  return formatSrtTime(seconds).replace(",", ".");
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
