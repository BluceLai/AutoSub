export const longMediaConfirmationThresholdSeconds = 60;

export function shouldConfirmRetranscription(segments) {
  return Array.isArray(segments) && segments.length > 0;
}

export function shouldConfirmLongMedia(durationSeconds, thresholdSeconds = longMediaConfirmationThresholdSeconds) {
  const duration = Number(durationSeconds);
  return Number.isFinite(duration) && duration > thresholdSeconds;
}

export function createCloudTranscriptionConfirmationMessage(fileName, extractsAudio) {
  const safeName = String(fileName || "目前檔案");
  const uploadDescription = extractsAudio ? "本機抽出的音訊" : "這個音訊檔";
  return `產生字幕會把「${safeName}」的${uploadDescription}送到 OpenAI 雲端轉錄。API key 只留在本機 server，不會送到瀏覽器。若內容包含不可外傳的隱私或機密資訊，請按取消。確定要繼續嗎？`;
}

export function createOfflineTranscriptionConfirmationMessage(fileName) {
  const safeName = String(fileName || "目前檔案");
  return `產生字幕會在本機使用 whisper.cpp 離線轉錄「${safeName}」，不會把音訊送到 OpenAI。`;
}

export function createRetranscriptionConfirmationMessage(fileName, segmentCount) {
  const safeName = String(fileName || "目前影片");
  const count = Math.max(0, Number(segmentCount) || 0);
  return `目前「${safeName}」已有 ${count} 段字幕。重新產生會用新的轉錄結果取代目前字幕，確定要繼續嗎？`;
}

export function createTranscriptionConfirmationMessage({
  fileName,
  extractsAudio,
  engine = "cloud",
  segmentCount = 0,
  durationSeconds = null,
  longThresholdSeconds = longMediaConfirmationThresholdSeconds,
}) {
  const usesOffline = engine === "offline";
  const parts = [
    usesOffline
      ? createOfflineTranscriptionConfirmationMessage(fileName)
      : createCloudTranscriptionConfirmationMessage(fileName, extractsAudio),
  ];

  if (segmentCount > 0) {
    parts.push(`目前已有 ${segmentCount} 段字幕，重新產生會用新的轉錄結果取代目前字幕。`);
  }

  if (shouldConfirmLongMedia(durationSeconds, longThresholdSeconds)) {
    parts.push(
      usesOffline
        ? `目前媒體長度約 ${formatConfirmationDuration(durationSeconds)}，本機離線轉錄會花較長時間，請保持 AutoSub 服務開啟。`
        : `目前媒體長度約 ${formatConfirmationDuration(durationSeconds)}，線上轉錄會依音訊長度消耗用量。正式測試建議先用 10 秒音訊樣本。`,
    );
  }

  return parts.join("\n\n");
}

export function formatConfirmationDuration(durationSeconds) {
  const totalSeconds = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} 秒`;
  return `${minutes} 分 ${String(seconds).padStart(2, "0")} 秒`;
}
