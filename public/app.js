import { createSplitUnits, estimateSpeechProgressRatio } from "./subtitle-text.js";
import { getSubtitleQualityIssues } from "./subtitle-quality.js";
import {
  clampSegmentEnd as clampTimelineSegmentEnd,
  clampSegmentShift as clampTimelineSegmentShift,
  clampSegmentStart as clampTimelineSegmentStart,
  enforceNonOverlappingSegments,
  getWheelTimeDelta,
} from "./subtitle-timing.js";
import { getSubtitleJumpTarget } from "./subtitle-navigation.js";
import { getSubtitleInsertSlot } from "./subtitle-insert.js";
import { parseSubtitleFile } from "./subtitle-file.js";
import { findSubtitleMatches, replaceAllSubtitleMatches, replaceSubtitleMatch } from "./subtitle-search.js";
import { getQualityIssueNavigationIndex } from "./quality-navigation.js";
import { getTranscriptionProgressView } from "./transcription-progress.js";
import { createTranscriptionConfirmationMessage } from "./transcription-guard.js";

const mediaInput = document.querySelector("#mediaInput");
const mediaPlayer = document.querySelector("#mediaPlayer");
const projectInput = document.querySelector("#projectInput");
const importProjectButton = document.querySelector("#importProjectButton");
const subtitleInput = document.querySelector("#subtitleInput");
const importSubtitleButton = document.querySelector("#importSubtitleButton");
const exportProjectButton = document.querySelector("#exportProjectButton");
const demoButton = document.querySelector("#demoButton");
const transcribeButton = document.querySelector("#transcribeButton");
const exportButton = document.querySelector("#exportButton");
const exportFormat = document.querySelector("#exportFormat");
const shutdownButton = document.querySelector("#shutdownButton");
const engineInputs = Array.from(document.querySelectorAll("input[name='transcriptionEngine']"));
const statusText = document.querySelector("#statusText");
const keyStatus = document.querySelector("#keyStatus");
const projectStatus = document.querySelector("#projectStatus");
const timeText = document.querySelector("#timeText");
const captionOverlay = document.querySelector("#captionOverlay");
const segmentsList = document.querySelector("#segmentsList");
const emptyState = document.querySelector("#emptyState");
const segmentCount = document.querySelector("#segmentCount");
const addSegmentButton = document.querySelector("#addSegmentButton");
const followPlaybackInput = document.querySelector("#followPlaybackInput");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const subtitleSearchInput = document.querySelector("#subtitleSearchInput");
const subtitleReplaceInput = document.querySelector("#subtitleReplaceInput");
const previousMatchButton = document.querySelector("#previousMatchButton");
const nextMatchButton = document.querySelector("#nextMatchButton");
const replaceMatchButton = document.querySelector("#replaceMatchButton");
const replaceAllButton = document.querySelector("#replaceAllButton");
const searchSummary = document.querySelector("#searchSummary");
const shiftAllButtons = Array.from(document.querySelectorAll("[data-shift-all]"));
const progressPanel = document.querySelector("#progressPanel");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const progressTrack = document.querySelector(".progress-track");
const progressBar = document.querySelector("#progressBar");
const qualityPanel = document.querySelector("#qualityPanel");
const qualitySummary = document.querySelector("#qualitySummary");
const qualityList = document.querySelector("#qualityList");
const previousIssueButton = document.querySelector("#previousIssueButton");
const nextIssueButton = document.querySelector("#nextIssueButton");
const maxUndoSteps = 10;
const videoExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".webm", ".wmv"]);

let selectedFile = null;
let mediaUrl = null;
let segments = [];
let activeSegmentId = null;
let hasApiKey = false;
let hasFfmpeg = false;
let hasOfflineEngine = false;
let offlineEngineStatus = "missing-command";
let currentProjectKey = null;
let transcriptionEngine = "cloud";
let saveTimer = null;
let splitMode = false;
let undoStack = [];
let redoStack = [];
let textEditSnapshotSegmentId = null;
let textEditSnapshotTaken = false;
let followPlayback = true;
let isDraggingNewSegment = false;
let addSegmentPointerStart = null;
let searchMatches = [];
let activeSearchMatchIndex = -1;
let qualityIssues = [];
let activeQualityIssueIndex = -1;
let qualityPulseTimer = null;

initializeTranscriptionEngine();
checkHealth();

for (const input of engineInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;

    transcriptionEngine = input.value === "offline" ? "offline" : "cloud";
    localStorage.setItem("autosub:transcription-engine", transcriptionEngine);
    updateTranscribeAvailability();
    if (selectedFile) setStatus(getSelectedFileStatusMessage(selectedFile));
    updateKeyStatus();
  });
}

window.addEventListener("keydown", (event) => {
  if (isEditableTarget(event.target)) return;

  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    redoLastAction();
    return;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    undoLastAction();
    return;
  }

  if (event.ctrlKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redoLastAction();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    jumpToAdjacentSubtitle("next");
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    jumpToAdjacentSubtitle("previous");
    return;
  }

  if (event.key === " " || event.key === "Space" || event.key === "Spacebar") {
    event.preventDefault();
    if (event.repeat) return;

    togglePlayback();
    return;
  }

  if (event.key === "Control") {
    setSplitMode(true);
  }
}, { capture: true });

window.addEventListener("keyup", (event) => {
  if (event.key === "Control") {
    setSplitMode(false);
  }
});

window.addEventListener("blur", () => setSplitMode(false));

mediaInput.addEventListener("change", () => {
  const file = mediaInput.files?.[0];
  if (!file) return;

  selectedFile = file;
  segments = [];
  activeSegmentId = null;
  currentProjectKey = getProjectKey(file);
  clearUndoHistory();

  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  mediaUrl = URL.createObjectURL(file);
  mediaPlayer.src = mediaUrl;

  const savedProject = loadSavedProject(currentProjectKey);
  if (savedProject) {
    segments = savedProject.segments;
  }
  normalizeSegmentOrder();

  importProjectButton.disabled = false;
  importSubtitleButton.disabled = false;
  addSegmentButton.disabled = false;
  exportProjectButton.disabled = segments.length === 0;
  demoButton.disabled = false;
  updateTranscribeAvailability();
  exportButton.disabled = segments.length === 0;
  exportFormat.disabled = segments.length === 0;
  enableOutputControls();
  updateSearchControls();
  hideProgress();
  if (savedProject) {
    setStatus(`已接回 ${file.name} 的本機字幕專案。`);
    setProjectStatus(`上次儲存：${formatSavedAt(savedProject.savedAt)}`);
  } else {
    setStatus(getSelectedFileStatusMessage(file));
    setProjectStatus("尚未建立字幕專案");
  }
  renderSegments();
  updateActiveCaption();
});

addSegmentButton.draggable = false;
addSegmentButton.title = "按住拖曳到兩段字幕中間新增，不會調整原本字幕時間。";
addSegmentButton.addEventListener("click", () => {
  if (!selectedFile) return;

  setStatus("請按住「新增字幕段」拖曳到兩段字幕中間的空檔。");
});
addSegmentButton.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;

  beginNewSegmentDrag(event);
});

window.addEventListener("pointermove", (event) => {
  if (!isDraggingNewSegment) return;

  if (addSegmentPointerStart) {
    const movedDistance = Math.hypot(event.clientX - addSegmentPointerStart.x, event.clientY - addSegmentPointerStart.y);
    addSegmentPointerStart.moved = addSegmentPointerStart.moved || movedDistance > 6;
  }
  setInsertDropHighlight(getInsertZoneAtPoint(event.clientX, event.clientY));
});

window.addEventListener("pointerup", (event) => {
  if (!isDraggingNewSegment) return;

  const zone = getInsertZoneAtPoint(event.clientX, event.clientY);
  const moved = addSegmentPointerStart?.moved === true;
  if (zone) {
    insertSubtitleBetween(zone.dataset.previousId, zone.dataset.nextId);
  } else if (moved) {
    setStatus("未放在兩段字幕中間，沒有新增字幕段。", true);
  }
  endNewSegmentDrag();
});

undoButton.addEventListener("click", undoLastAction);
redoButton.addEventListener("click", redoLastAction);
subtitleSearchInput.addEventListener("input", () => updateSubtitleSearch({ resetActive: true }));
subtitleReplaceInput.addEventListener("input", updateSearchControls);
previousMatchButton.addEventListener("click", () => moveSearchResult(-1));
nextMatchButton.addEventListener("click", () => moveSearchResult(1));
replaceMatchButton.addEventListener("click", replaceCurrentSearchMatch);
replaceAllButton.addEventListener("click", replaceAllSearchMatches);
previousIssueButton.addEventListener("click", () => moveQualityIssue("previous"));
nextIssueButton.addEventListener("click", () => moveQualityIssue("next"));

followPlaybackInput.addEventListener("change", () => {
  followPlayback = followPlaybackInput.checked;
  if (followPlayback) {
    scrollActiveSegmentIntoView({ behavior: "smooth", force: true });
    setStatus("已開啟跟隨播放，右側字幕會自動對齊目前播放段落。");
  } else {
    setStatus("已關閉跟隨播放，可以手動停在想編輯的字幕段落。");
  }
});

for (const button of shiftAllButtons) {
  button.addEventListener("click", () => shiftAllSegments(Number(button.dataset.shiftAll)));
}

transcribeButton.addEventListener("click", async () => {
  if (!selectedFile) return;

  const shouldTranscribe = window.confirm(
    createTranscriptionConfirmationMessage({
      fileName: selectedFile.name,
      extractsAudio: needsAudioExtraction(selectedFile),
      engine: transcriptionEngine,
      segmentCount: segments.length,
      durationSeconds: Number.isFinite(mediaPlayer.duration) ? mediaPlayer.duration : null,
    }),
  );
  if (!shouldTranscribe) {
    setStatus("已取消產生字幕，沒有送出檔案。");
    return;
  }

  transcribeButton.disabled = true;
  transcribeButton.textContent = "處理中...";
  exportButton.disabled = true;
  setProgress(transcriptionEngine === "offline" ? "準備離線轉錄" : "準備上傳", 0);
  setStatus(transcriptionEngine === "offline" ? "正在準備本機離線轉錄..." : "正在準備檔案...");

  try {
    const payload = await transcribeWithProgress(selectedFile);

    commitSegmentChange("產生字幕", () => {
      segments = payload.segments.map((segment) => ({ ...segment }));
    });
    setProgress("完成", 100);
    setStatus(`完成：產生 ${segments.length} 段字幕。${formatUploadSummary(payload.upload)}`);
  } catch (error) {
    console.error(error);
    setStatus(error instanceof Error ? error.message : String(error), true);
  } finally {
    transcribeButton.textContent = "產生字幕";
    updateTranscribeAvailability();
  }
});

demoButton.addEventListener("click", () => {
  if (!selectedFile) return;

  const duration = Number.isFinite(mediaPlayer.duration) ? mediaPlayer.duration : 20;
  commitSegmentChange("載入測試字幕", () => {
    segments = createDemoSegments(Math.min(duration, 20));
  });
  setProgress("測試字幕已載入", 100);
  setStatus(`已載入 ${segments.length} 段測試字幕，不會消耗 OpenAI 用量。`);
});

importProjectButton.addEventListener("click", () => {
  projectInput.click();
});

importSubtitleButton.addEventListener("click", () => {
  subtitleInput.click();
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

    commitSegmentChange("匯入專案", () => {
      segments = project.segments;
    });
    setProgress("專案已匯入", 100);
    setStatus(`已匯入 ${segments.length} 段字幕專案。`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "專案匯入失敗。", true);
  }
});

subtitleInput.addEventListener("change", async () => {
  const file = subtitleInput.files?.[0];
  subtitleInput.value = "";
  if (!file || !selectedFile) return;

  try {
    const importedSegments = parseSubtitleFile(await file.text()).map((segment) => ({
      ...segment,
      id: crypto.randomUUID(),
    }));
    commitSegmentChange("匯入字幕", () => {
      segments = importedSegments;
    });
    setProgress("字幕已匯入", 100);
    setStatus(`已匯入 ${segments.length} 段字幕：${file.name}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "字幕匯入失敗。", true);
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
  importSubtitleButton.disabled = true;
  exportProjectButton.disabled = true;
  addSegmentButton.disabled = true;
  undoButton.disabled = true;
  redoButton.disabled = true;
  for (const button of shiftAllButtons) button.disabled = true;
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

mediaPlayer.addEventListener("seeked", () => updateActiveCaption({ forceScroll: true }));

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

    const startInput = createTimeInput(
      segment.start,
      (value) => {
        changeSegmentStart(segment.id, value);
      },
      (delta) => {
        changeSegmentStart(segment.id, segment.start + delta);
      },
    );

    const endInput = createTimeInput(
      segment.end,
      (value) => {
        changeSegmentEnd(segment.id, value);
      },
      (delta) => {
        changeSegmentEnd(segment.id, segment.end + delta);
      },
    );

    timeBox.append(jumpButton, startInput, endInput);

    const contentBox = document.createElement("div");
    contentBox.className = "segment-content";
    const textarea = document.createElement("textarea");
    textarea.value = segment.text;
    textarea.addEventListener("focus", () => {
      textEditSnapshotSegmentId = segment.id;
      textEditSnapshotTaken = false;
    });
    textarea.addEventListener("input", () => {
      recordTextEditSnapshot(segment.id);
      segment.text = textarea.value;
      scheduleSaveProject();
      updateActiveCaption();
      renderQualityIssues();
      updateSubtitleSearch({ jump: false });
    });
    textarea.addEventListener("blur", () => {
      if (textEditSnapshotSegmentId === segment.id) {
        textEditSnapshotSegmentId = null;
        textEditSnapshotTaken = false;
      }
    });

    const splitGuide = createSplitGuide(segment);
    const tools = document.createElement("div");
    tools.className = "segment-tools";

    const duration = document.createElement("span");
    duration.className = "segment-duration";
    duration.textContent = `${formatDuration(segment.end - segment.start)}`;
    duration.title = "滑鼠滾輪調整這段字幕長度，每格 0.1 秒";
    duration.addEventListener("wheel", (event) => {
      event.preventDefault();
      changeSegmentEnd(segment.id, segment.end + getWheelTimeDelta(event.deltaY));
    });
    if (segment.end <= segment.start) duration.classList.add("warning");

    const actions = document.createElement("div");
    actions.className = "segment-actions";

    const nudgeBackButton = createNudgeButton("-0.1s", segment.id, -0.1);
    const nudgeForwardButton = createNudgeButton("+0.1s", segment.id, 0.1);

    const mergeButton = document.createElement("button");
    mergeButton.type = "button";
    mergeButton.textContent = "合併下段";
    mergeButton.disabled = segmentIndex === segments.length - 1;
    mergeButton.addEventListener("click", () => mergeWithNextSegment(segment.id));

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", () => {
      commitSegmentChange("刪除字幕段", () => {
        segments = segments.filter((candidate) => candidate.id !== segment.id);
      });
    });

    actions.append(nudgeBackButton, nudgeForwardButton, mergeButton, deleteButton);
    tools.append(duration, actions);
    contentBox.append(textarea, splitGuide, tools);
    item.append(timeBox, contentBox);
    segmentsList.append(item);

    const nextSegment = segments[segmentIndex + 1];
    if (nextSegment) {
      segmentsList.append(createInsertDropZone(segment, nextSegment));
    }
  }

  markActiveSegment();
  markSearchMatches();
  renderQualityIssues();
}

function createInsertDropZone(previousSegment, nextSegment) {
  const zone = document.createElement("li");
  zone.className = "insert-zone";
  zone.dataset.previousId = previousSegment.id;
  zone.dataset.nextId = nextSegment.id;

  const slot = getSubtitleInsertSlot(segments, previousSegment.id, nextSegment.id);
  const canInsert = Boolean(slot);
  zone.classList.toggle("is-available", canInsert);
  zone.classList.toggle("is-unavailable", !canInsert);
  zone.title = canInsert
    ? `拖放新增字幕：${formatClock(slot.start)} - ${formatClock(slot.end)}`
    : "這兩段字幕中間沒有可用時間，無法新增。";

  const label = document.createElement("span");
  label.className = "insert-zone-label";
  label.textContent = canInsert ? `新增空白字幕 ${formatDuration(slot.end - slot.start)}` : "無空檔";
  zone.append(label);

  return zone;
}

function changeSegmentStart(segmentId, value, options = {}) {
  const segment = segments.find((candidate) => candidate.id === segmentId);
  if (!segment) return;

  const nextStart = clampSegmentStart(segmentId, value);
  const wasClamped = Math.abs(nextStart - value) > 0.0001;
  if (nextStart === segment.start) {
    if (wasClamped) {
      renderSegments();
      setStatus("開始時間已自動限制，不能早於上一段結束或越過本段結束。", true);
    }
    return;
  }
  commitSegmentChange(
    "修改開始時間",
    () => {
      segment.start = nextStart;
    },
    { save: options.save ?? "schedule" },
  );
  if (wasClamped) setStatus("開始時間已自動限制，不能早於上一段結束或越過本段結束。", true);
}

function changeSegmentEnd(segmentId, value, options = {}) {
  const segment = segments.find((candidate) => candidate.id === segmentId);
  if (!segment) return;

  const nextEnd = clampSegmentEnd(segmentId, value);
  const wasClamped = Math.abs(nextEnd - value) > 0.0001;
  if (nextEnd === segment.end) {
    if (wasClamped) {
      renderSegments();
      setStatus("結束時間已自動限制，不能超過下一段開始。", true);
    }
    return;
  }
  commitSegmentChange(
    "修改結束時間",
    () => {
      segment.end = nextEnd;
    },
    { save: options.save ?? "schedule" },
  );
  if (wasClamped) setStatus("結束時間已自動限制，不能超過下一段開始。", true);
}

function clampSegmentStart(segmentId, value) {
  return clampTimelineSegmentStart(segments, segmentId, value);
}

function clampSegmentEnd(segmentId, value) {
  return clampTimelineSegmentEnd(segments, segmentId, value);
}

function clampSegmentShift(segmentId, delta) {
  return clampTimelineSegmentShift(segments, segmentId, delta);
}

function createTimeInput(value, onChange, onWheel) {
  const input = document.createElement("input");
  input.className = "time-input";
  input.value = formatClock(value);
  input.inputMode = "decimal";
  let lastCommittedValue = input.value;
  const commitValue = () => {
    if (input.value === lastCommittedValue) return;
    lastCommittedValue = input.value;
    onChange(parseTime(input.value));
  };

  input.addEventListener("change", commitValue);
  input.addEventListener("blur", commitValue);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    commitValue();
  });
  if (onWheel) {
    input.title = "滑鼠滾輪調整時間，每格 0.1 秒";
    input.addEventListener("wheel", (event) => {
      event.preventDefault();
      onWheel(getWheelTimeDelta(event.deltaY));
    });
  }
  return input;
}

function createNudgeButton(label, segmentId, delta) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = `${delta > 0 ? "延後" : "提前"}這段字幕 ${Math.abs(delta).toFixed(1)} 秒`;
  button.addEventListener("click", () => shiftSegment(segmentId, delta));
  return button;
}

function renderQualityIssues() {
  qualityPanel.hidden = segments.length === 0;
  qualityList.innerHTML = "";
  clearSegmentQualityClasses();
  if (segments.length === 0) {
    qualityIssues = [];
    activeQualityIssueIndex = -1;
    updateQualityIssueControls();
    return;
  }

  qualityIssues = getSubtitleQualityIssues(segments);
  if (activeQualityIssueIndex >= qualityIssues.length) activeQualityIssueIndex = qualityIssues.length > 0 ? 0 : -1;
  qualityPanel.classList.toggle("is-clean", qualityIssues.length === 0);
  qualityPanel.classList.toggle("has-issues", qualityIssues.length > 0);
  updateQualityIssueControls();

  qualityIssues.forEach((issue, issueIndex) => {
    const item = document.createElement("li");
    item.className = `quality-item is-${issue.severity}`;
    item.classList.toggle("is-active", issueIndex === activeQualityIssueIndex);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${issue.label}：${issue.message}`;
    button.addEventListener("click", () => focusQualityIssue(issueIndex));

    item.append(button);
    qualityList.append(item);
    markSegmentQuality(issue.segmentId, issue.severity);
  });
}

function clearSegmentQualityClasses() {
  for (const item of segmentsList.querySelectorAll(".segment")) {
    item.classList.remove("has-quality-error", "has-quality-warning", "has-quality-info", "is-quality-target");
  }
}

function markSegmentQuality(segmentId, severity) {
  const item = Array.from(segmentsList.querySelectorAll(".segment")).find((candidate) => candidate.dataset.id === segmentId);
  if (!item) return;

  item.classList.add(`has-quality-${severity}`);
}

function updateQualityIssueControls() {
  const hasIssues = qualityIssues.length > 0;
  previousIssueButton.disabled = !hasIssues;
  nextIssueButton.disabled = !hasIssues;

  if (!hasIssues) {
    qualitySummary.textContent = "目前未發現明顯問題";
    return;
  }

  qualitySummary.textContent =
    activeQualityIssueIndex === -1 ? `${qualityIssues.length} 項需確認` : `${activeQualityIssueIndex + 1} / ${qualityIssues.length} 項需確認`;
}

function moveQualityIssue(direction) {
  const nextIndex = getQualityIssueNavigationIndex(qualityIssues, activeQualityIssueIndex, direction);
  if (nextIndex === -1) return;

  focusQualityIssue(nextIndex);
}

function focusQualityIssue(index) {
  const issue = qualityIssues[index];
  if (!issue) return;

  activeQualityIssueIndex = index;
  updateQualityIssueControls();
  markActiveQualityIssue();
  jumpToSegment(issue.segmentId);
  pulseSegment(issue.segmentId);
  setStatus(`已定位品質問題：${issue.label}`);
}

function markActiveQualityIssue() {
  for (const [index, item] of Array.from(qualityList.querySelectorAll(".quality-item")).entries()) {
    item.classList.toggle("is-active", index === activeQualityIssueIndex);
  }
}

function pulseSegment(segmentId) {
  window.clearTimeout(qualityPulseTimer);
  for (const item of segmentsList.querySelectorAll(".segment")) {
    item.classList.remove("is-quality-target");
  }

  const item = getSegmentItem(segmentId);
  if (!item) return;

  item.classList.add("is-quality-target");
  qualityPulseTimer = window.setTimeout(() => {
    item.classList.remove("is-quality-target");
  }, 1400);
}

function jumpToSegment(segmentId) {
  const segment = segments.find((candidate) => candidate.id === segmentId);
  if (!segment) return;

  mediaPlayer.currentTime = Math.max(0, segment.start);
  activeSegmentId = segment.id;
  updateActiveCaption({ forceScroll: true });
}

function updateSubtitleSearch(options = {}) {
  searchMatches = findSubtitleMatches(segments, subtitleSearchInput.value);
  if (options.resetActive || activeSearchMatchIndex >= searchMatches.length) {
    activeSearchMatchIndex = searchMatches.length > 0 ? 0 : -1;
  }
  updateSearchControls();
  markSearchMatches();
  if (options.jump !== false && activeSearchMatchIndex !== -1) {
    jumpToSearchMatch(activeSearchMatchIndex);
  }
}

function updateSearchControls() {
  const hasSegments = segments.length > 0;
  const hasQuery = subtitleSearchInput.value.trim().length > 0;
  const hasMatches = searchMatches.length > 0;
  subtitleSearchInput.disabled = !hasSegments;
  subtitleReplaceInput.disabled = !hasSegments;
  previousMatchButton.disabled = !hasMatches;
  nextMatchButton.disabled = !hasMatches;
  replaceMatchButton.disabled = !hasMatches;
  replaceAllButton.disabled = !hasQuery || !hasMatches;

  if (!hasQuery) {
    searchSummary.textContent = "0 筆";
  } else if (!hasMatches) {
    searchSummary.textContent = "無結果";
  } else {
    searchSummary.textContent = `${activeSearchMatchIndex + 1} / ${searchMatches.length}`;
  }
}

function moveSearchResult(direction) {
  if (searchMatches.length === 0) return;

  activeSearchMatchIndex = (activeSearchMatchIndex + direction + searchMatches.length) % searchMatches.length;
  updateSearchControls();
  markSearchMatches();
  jumpToSearchMatch(activeSearchMatchIndex);
}

function jumpToSearchMatch(index) {
  const match = searchMatches[index];
  if (!match) return;

  jumpToSegment(match.segmentId);
}

function replaceCurrentSearchMatch() {
  const match = searchMatches[activeSearchMatchIndex];
  if (!match) return;

  commitSegmentChange("取代字幕文字", () => {
    segments = replaceSubtitleMatch(segments, match, subtitleReplaceInput.value);
  });
  updateSubtitleSearch({ jump: true });
  setStatus("已取代目前搜尋結果。");
}

function replaceAllSearchMatches() {
  const query = subtitleSearchInput.value;
  if (searchMatches.length === 0 || !query.trim()) return;

  const replacedCount = searchMatches.length;
  commitSegmentChange("全部取代字幕文字", () => {
    segments = replaceAllSubtitleMatches(segments, query, subtitleReplaceInput.value);
  });
  updateSubtitleSearch({ resetActive: true, jump: false });
  setStatus(`已全部取代 ${replacedCount} 筆搜尋結果。`);
}

function markSearchMatches() {
  for (const item of segmentsList.querySelectorAll(".segment")) {
    item.classList.remove("has-search-match", "is-search-active");
  }

  for (const match of searchMatches) {
    getSegmentItem(match.segmentId)?.classList.add("has-search-match");
  }

  const activeMatch = searchMatches[activeSearchMatchIndex];
  if (activeMatch) {
    getSegmentItem(activeMatch.segmentId)?.classList.add("is-search-active");
  }
}

function getSegmentItem(segmentId) {
  return Array.from(segmentsList.querySelectorAll(".segment")).find((item) => item.dataset.id === segmentId) ?? null;
}

function jumpToAdjacentSubtitle(direction) {
  if (segments.length === 0) {
    setStatus("目前沒有字幕段可以跳轉。", true);
    return;
  }

  updateActiveCaption();
  const targetTime = getSubtitleJumpTarget(segments, mediaPlayer.currentTime || 0, direction, activeSegmentId);
  if (targetTime === null) {
    setStatus(direction === "next" ? "已經是最後一段字幕。" : "已經是第一段字幕。", true);
    return;
  }

  const targetSegment = segments.find((segment) => segment.start === targetTime);
  mediaPlayer.currentTime = Math.max(0, targetTime);
  activeSegmentId = targetSegment?.id ?? null;
  updateActiveCaption({ forceScroll: true });
  setStatus(`已跳到${direction === "next" ? "下一段" : "上一段"}字幕 ${formatClock(targetTime)}。`);
}

function togglePlayback() {
  if (!mediaPlayer.currentSrc && !mediaPlayer.src) {
    setStatus("請先選擇影片或音訊檔。", true);
    return;
  }

  if (mediaPlayer.paused || mediaPlayer.ended) {
    mediaPlayer
      .play()
      .then(() => {
        setStatus("開始播放。");
      })
      .catch(() => {
        setStatus("無法開始播放，請先確認影片已載入。", true);
      });
    return;
  }

  mediaPlayer.pause();
  setStatus("已暫停播放。");
}

function updateActiveCaption(options = {}) {
  const time = mediaPlayer.currentTime || 0;
  const active = segments.find((segment) => time >= segment.start && time <= segment.end);
  const nextActiveSegmentId = active?.id ?? null;
  const activeChanged = nextActiveSegmentId !== activeSegmentId;
  activeSegmentId = nextActiveSegmentId;
  captionOverlay.innerHTML = active ? `<span>${escapeHtml(active.text)}</span>` : "";
  markActiveSegment();
  if (activeChanged || options.forceScroll) {
    scrollActiveSegmentIntoView({ behavior: "smooth", force: options.forceScroll });
  }
}

function markActiveSegment() {
  for (const item of segmentsList.querySelectorAll(".segment")) {
    item.classList.toggle("is-active", item.dataset.id === activeSegmentId);
  }
}

function scrollActiveSegmentIntoView(options = {}) {
  if (!followPlayback || !activeSegmentId) return;

  const activeItem = Array.from(segmentsList.querySelectorAll(".segment")).find((item) => item.dataset.id === activeSegmentId);
  if (!activeItem) return;

  const listRect = segmentsList.getBoundingClientRect();
  const itemRect = activeItem.getBoundingClientRect();
  const isOutsideView = itemRect.top < listRect.top + 24 || itemRect.bottom > listRect.bottom - 24;
  if (options.force || isOutsideView) {
    activeItem.scrollIntoView({
      block: "center",
      behavior: options.behavior ?? "smooth",
    });
  }
}

function setStatus(message, isWarning = false) {
  statusText.textContent = message;
  statusText.classList.toggle("warning", isWarning);
}

function setProjectStatus(message) {
  projectStatus.textContent = message;
}

function setSplitMode(enabled) {
  if (splitMode === enabled) return;
  splitMode = enabled;
  document.body.classList.toggle("is-split-mode", enabled);
  for (const guide of segmentsList.querySelectorAll(".split-guide")) {
    guide.setAttribute("aria-hidden", enabled ? "false" : "true");
  }
  if (enabled && segments.length > 0) {
    setStatus("Ctrl 拆分模式：文字框已暫時隱藏，移到文字上會醒目提示，點一下即可從該字前拆分。");
  }
}

function createSplitGuide(segment) {
  const guide = document.createElement("div");
  guide.className = "split-guide";
  guide.setAttribute("aria-hidden", splitMode ? "false" : "true");

  const units = createSplitUnits(segment.text);

  for (const unit of units) {
    if (!unit.canSplit) {
      const token = document.createElement("span");
      token.className = `split-token ${unit.className}`;
      token.textContent = unit.text;
      guide.append(token);
      continue;
    }

    const token = document.createElement("button");
    token.type = "button";
    token.className = "split-token";
    token.textContent = unit.text;
    token.title = `從「${unit.text}」前拆分`;
    token.setAttribute("aria-label", `從「${unit.text}」前拆分，該文字會移到下一段`);
    token.addEventListener("click", () => splitSegmentAtTextIndex(segment.id, unit.start));
    guide.append(token);
  }

  return guide;
}

function splitSegmentAtTextIndex(segmentId, characterIndex) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1) return;

  const segment = segments[index];
  const characters = Array.from(segment.text.trim());
  if (characters.length < 2 || characterIndex <= 0 || characterIndex >= characters.length) {
    setStatus("這個位置不能拆分。", true);
    return;
  }

  const duration = segment.end - segment.start;
  if (duration < 0.6) {
    setStatus("這段太短，至少需要 0.6 秒才能拆分。", true);
    return;
  }

  const ratio = estimateSpeechProgressRatio(segment.text, characterIndex);
  const splitAt = clampTime(segment.start + duration * ratio, segment.start + 0.2, segment.end - 0.2);
  const firstText = characters.slice(0, characterIndex).join("").trim();
  const secondText = characters.slice(characterIndex).join("").trim();

  commitSegmentChange("拆分字幕段", () => {
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
  });
  setStatus("已從點選文字前拆分字幕段，點選的文字已移到下一段。");
}

function insertSubtitleBetween(previousSegmentId, nextSegmentId) {
  const slot = getSubtitleInsertSlot(segments, previousSegmentId, nextSegmentId);
  if (!slot) {
    setStatus("這兩段字幕中間沒有可用時間，無法新增。", true);
    return;
  }

  commitSegmentChange("新增字幕段", () => {
    segments.splice(slot.index, 0, {
      id: crypto.randomUUID(),
      index: slot.index + 1,
      start: slot.start,
      end: slot.end,
      text: "新增字幕",
    });
  });
  setStatus(`已在 ${formatClock(slot.start)} - ${formatClock(slot.end)} 新增字幕段。`);
}

function mergeWithNextSegment(segmentId) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1 || index >= segments.length - 1) return;

  const current = segments[index];
  const next = segments[index + 1];
  commitSegmentChange("合併字幕段", () => {
    segments.splice(index, 2, {
      ...current,
      end: Math.max(current.end, next.end),
      text: [current.text.trim(), next.text.trim()].filter(Boolean).join(" "),
    });
  });
  setStatus("已合併下一段字幕。");
}

function shiftSegment(segmentId, delta) {
  const segment = segments.find((candidate) => candidate.id === segmentId);
  if (!segment) return;

  const effectiveDelta = clampSegmentShift(segmentId, delta);
  if (effectiveDelta === 0) {
    setStatus(delta > 0 ? "這段字幕已經貼近下一段，不能再往後。" : "這段字幕已經貼近上一段或 0 秒，不能再往前。", true);
    return;
  }

  commitSegmentChange("微調單段時間", () => {
    segment.start += effectiveDelta;
    segment.end += effectiveDelta;
  });
  setStatus(`已${effectiveDelta > 0 ? "延後" : "提前"}這段字幕 ${Math.abs(effectiveDelta).toFixed(1)} 秒。`);
}

function beginNewSegmentDrag(event) {
  if (!selectedFile || segments.length < 2) {
    event.preventDefault();
    setStatus("需要至少兩段字幕，才能拖曳到中間新增。", true);
    return false;
  }

  isDraggingNewSegment = true;
  addSegmentPointerStart = "clientX" in event ? { x: event.clientX, y: event.clientY, moved: false } : null;
  document.body.classList.add("is-adding-segment");
  setStatus("拖曳到兩段字幕中間的空檔放開即可新增。");
  return true;
}

function endNewSegmentDrag() {
  isDraggingNewSegment = false;
  addSegmentPointerStart = null;
  document.body.classList.remove("is-adding-segment");
  clearInsertDropHighlights();
}

function getInsertZoneAtPoint(x, y) {
  return document.elementFromPoint(x, y)?.closest(".insert-zone") ?? null;
}

function setInsertDropHighlight(activeZone) {
  for (const zone of segmentsList.querySelectorAll(".insert-zone")) {
    zone.classList.toggle("is-drag-over", zone === activeZone);
  }
}

function clearInsertDropHighlights() {
  for (const zone of segmentsList.querySelectorAll(".insert-zone")) {
    zone.classList.remove("is-drag-over");
  }
}

function shiftAllSegments(delta) {
  if (segments.length === 0) return;

  const earliestStart = Math.min(...segments.map((segment) => segment.start));
  const effectiveDelta = Math.max(delta, -earliestStart);
  if (effectiveDelta === 0) {
    setStatus("最前面的字幕已經在 0 秒，不能再整體提前。", true);
    return;
  }

  commitSegmentChange("微調整體時間", () => {
    segments = segments.map((segment) => ({
      ...segment,
      start: segment.start + effectiveDelta,
      end: segment.end + effectiveDelta,
    }));
  });
  setStatus(`已整體${effectiveDelta > 0 ? "延後" : "提前"}字幕 ${Math.abs(effectiveDelta).toFixed(1)} 秒。`);
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

  enforceNonOverlappingSegments(segments);
}

function enableOutputControls() {
  const hasSegments = segments.length > 0;
  exportButton.disabled = !hasSegments;
  exportFormat.disabled = !hasSegments;
  exportProjectButton.disabled = !hasSegments;
  for (const button of shiftAllButtons) button.disabled = !hasSegments;
  updateSearchControls();
}

function commitSegmentChange(label, changeSegments, options = {}) {
  pushUndoSnapshot(label);
  changeSegments();
  if (options.normalize !== false) normalizeSegmentOrder();
  if (options.enableOutputControls !== false) enableOutputControls();

  if (options.save === "schedule") {
    scheduleSaveProject();
  } else {
    saveProjectNow();
  }

  if (options.render !== false) renderSegments();
  if (options.updateCaption !== false) updateActiveCaption();
  if (options.search !== false) updateSubtitleSearch({ jump: false });
}

function recordTextEditSnapshot(segmentId) {
  if (textEditSnapshotTaken && textEditSnapshotSegmentId === segmentId) return;

  pushUndoSnapshot("修改文字");
  textEditSnapshotSegmentId = segmentId;
  textEditSnapshotTaken = true;
}

function pushUndoSnapshot(label) {
  undoStack.push({
    label,
    segments: cloneSegments(segments),
  });
  if (undoStack.length > maxUndoSteps) undoStack.shift();
  redoStack = [];
  updateHistoryButtons();
}

function undoLastAction() {
  const snapshot = undoStack.pop();
  if (!snapshot) return;

  redoStack.push({
    label: snapshot.label,
    segments: cloneSegments(segments),
  });
  if (redoStack.length > maxUndoSteps) redoStack.shift();

  segments = cloneSegments(snapshot.segments);
  normalizeSegmentOrder();
  enableOutputControls();
  saveProjectNow();
  renderSegments();
  updateActiveCaption();
  updateSubtitleSearch({ jump: false });
  updateHistoryButtons();
  setStatus(`已復原：${snapshot.label}`);
}

function redoLastAction() {
  const snapshot = redoStack.pop();
  if (!snapshot) return;

  undoStack.push({
    label: snapshot.label,
    segments: cloneSegments(segments),
  });
  if (undoStack.length > maxUndoSteps) undoStack.shift();

  segments = cloneSegments(snapshot.segments);
  normalizeSegmentOrder();
  enableOutputControls();
  saveProjectNow();
  renderSegments();
  updateActiveCaption();
  updateSubtitleSearch({ jump: false });
  updateHistoryButtons();
  setStatus(`已重做：${snapshot.label}`);
}

function cloneSegments(items) {
  return items.map((segment) => ({ ...segment }));
}

function clearUndoHistory() {
  undoStack = [];
  redoStack = [];
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoButton.disabled = undoStack.length === 0;
  undoButton.textContent = undoStack.length > 0 ? `復原 (${undoStack.length})` : "復原";
  redoButton.disabled = redoStack.length === 0;
  redoButton.textContent = redoStack.length > 0 ? `重做 (${redoStack.length})` : "重做";
}

function isEditableTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target?.isContentEditable === true
  );
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
    hasFfmpeg = Boolean(health.hasFfmpeg);
    hasOfflineEngine = Boolean(health.transcriptionEngines?.offline?.ready);
    offlineEngineStatus = health.transcriptionEngines?.offline?.status ?? "missing-command";
    updateKeyStatus();
    updateTranscribeAvailability();
    if (selectedFile) setStatus(getSelectedFileStatusMessage(selectedFile));
  } catch {
    keyStatus.className = "key-status is-missing";
    keyStatus.textContent = "無法連線到本機服務";
    transcribeButton.disabled = true;
  }
}

function getProjectKey(file) {
  return `autosub:project:${file.name}:${file.size}:${file.lastModified}`;
}

function updateTranscribeAvailability() {
  transcribeButton.disabled = !canTranscribeSelectedFile();
}

function canTranscribeSelectedFile() {
  if (!selectedFile) return false;
  if (transcriptionEngine === "offline") return hasFfmpeg && hasOfflineEngine;
  if (!hasApiKey) return false;
  return !needsAudioExtraction(selectedFile) || hasFfmpeg;
}

function getSelectedFileStatusMessage(file) {
  if (transcriptionEngine === "offline") {
    if (!hasFfmpeg) return `已選擇 ${file.name}。本機離線轉錄需要先安裝 ffmpeg。`;
    if (!hasOfflineEngine) return `已選擇 ${file.name}。本機離線轉錄尚未就緒：${getOfflineEngineStatusLabel()}`;
    return `已選擇 ${file.name}，可以用 whisper.cpp 本機離線產生字幕。`;
  }

  if (!hasApiKey) return `已選擇 ${file.name}。尚未設定 API key，可先載入測試字幕。`;
  if (needsAudioExtraction(file) && !hasFfmpeg) {
    return `已選擇影片 ${file.name}。這台電腦尚未安裝 ffmpeg，暫時只能轉錄音訊檔。`;
  }
  if (needsAudioExtraction(file)) return `已選擇 ${file.name}，產生字幕時會先在本機抽出音訊。`;
  return `已選擇 ${file.name}，可以開始產生字幕。`;
}

function initializeTranscriptionEngine() {
  const savedEngine = localStorage.getItem("autosub:transcription-engine");
  transcriptionEngine = savedEngine === "offline" ? "offline" : "cloud";
  for (const input of engineInputs) {
    input.checked = input.value === transcriptionEngine;
  }
}

function updateKeyStatus() {
  if (transcriptionEngine === "offline") {
    keyStatus.className = `key-status ${hasOfflineEngine && hasFfmpeg ? "is-ready" : "is-missing"}`;
    keyStatus.textContent =
      hasOfflineEngine && hasFfmpeg
        ? "本機離線 whisper.cpp 已就緒，不會使用 OpenAI"
        : `本機離線尚未就緒：${getOfflineEngineStatusLabel()}`;
    return;
  }

  keyStatus.className = `key-status ${hasApiKey ? "is-ready" : "is-missing"}`;
  keyStatus.textContent = hasApiKey
    ? hasFfmpeg
      ? "OpenAI API key 已設定，可以正式產生字幕"
      : "OpenAI API key 已設定；影片轉錄需要 ffmpeg"
    : "尚未設定 OpenAI API key；可先用測試字幕模式";
}

function getOfflineEngineStatusLabel() {
  if (!hasFfmpeg) return "尚未安裝 ffmpeg";
  if (offlineEngineStatus === "needs-model") return "尚未設定 whisper.cpp 模型";
  if (offlineEngineStatus === "ready") return "whisper.cpp 已就緒";
  return "尚未安裝 whisper.cpp";
}

function needsAudioExtraction(file) {
  const contentType = String(file?.type || "").toLowerCase().split(";")[0].trim();
  if (contentType.startsWith("video/")) return true;
  if (contentType.startsWith("audio/")) return false;

  const extension = String(file?.name || "")
    .toLowerCase()
    .match(/\.[^.]+$/)?.[0];
  return videoExtensions.has(extension);
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
    request.open("POST", "/api/transcribe-jobs");
    request.responseType = "json";
    request.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("X-Transcription-Engine", transcriptionEngine);
    request.setRequestHeader("X-Transcription-Model", "whisper-1");
    if (currentProjectKey) request.setRequestHeader("X-Project-Key", encodeURIComponent(currentProjectKey));
    if (Number.isFinite(mediaPlayer.duration) && mediaPlayer.duration > 0) {
      request.setRequestHeader("X-Media-Duration", String(mediaPlayer.duration));
    }

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
      setProgress("建立轉錄工作", 40, { indeterminate: true });
      setStatus("上傳到本機完成，正在建立轉錄工作...");
    });

    request.addEventListener("load", () => {
      const payload = request.response;
      if (request.status >= 200 && request.status < 300) {
        subscribeToTranscriptionJob(payload, resolve, reject);
        return;
      }
      reject(new Error(formatApiError(payload)));
    });

    request.addEventListener("error", () => reject(new Error("連線失敗，請確認本機服務仍在執行。")));
    request.addEventListener("abort", () => reject(new Error("轉錄已取消。")));
    request.send(file);
  });
}

function subscribeToTranscriptionJob(payload, resolve, reject) {
  if (!payload?.eventsUrl) {
    reject(new Error("轉錄工作建立失敗：沒有收到進度事件網址。"));
    return;
  }

  const source = new EventSource(payload.eventsUrl);
  let settled = false;

  source.onmessage = (event) => {
    let update;
    try {
      update = JSON.parse(event.data);
    } catch {
      return;
    }

    applyTranscriptionProgressUpdate(update);

    if (update.stage === "complete") {
      settled = true;
      source.close();
      resolve(update.result);
    } else if (update.stage === "failed") {
      settled = true;
      source.close();
      reject(new Error(formatApiError(update.error ?? { error: update.message })));
    }
  };

  source.onerror = () => {
    source.close();
    if (!settled) reject(new Error("無法接收轉錄進度，請確認本機服務仍在執行。"));
  };
}

function applyTranscriptionProgressUpdate(update) {
  const view = getTranscriptionProgressView(update);
  setProgress(view.label, view.percent, { indeterminate: view.indeterminate });
  setStatus(view.status);
}

function formatUploadSummary(upload) {
  if (!upload) return "";

  if (upload.offline) {
    return ` 已使用 ${upload.engine ?? "whisper.cpp"} 本機離線轉錄。`;
  }

  const uploadedSize = formatFileSize(upload.uploadedBytes);
  if (upload.extractedAudio) {
    return ` 已先抽出音訊，實際送出 ${uploadedSize}。`;
  }

  return ` 實際送出 ${uploadedSize}。`;
}

function formatFileSize(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "未知大小";

  if (value < 1024) return `${Math.round(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
