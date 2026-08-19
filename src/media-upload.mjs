const audioExtensions = new Set([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav", ".webm"]);
const videoExtensions = new Set([".avi", ".m4v", ".mkv", ".mov", ".mp4", ".mpeg", ".mpg", ".webm", ".wmv"]);

export const extractedAudioContentType = "audio/mpeg";

export function shouldExtractAudio({ contentType = "", fileName = "" }) {
  const normalizedContentType = String(contentType).toLowerCase().split(";")[0].trim();
  if (normalizedContentType.startsWith("audio/")) return false;
  if (normalizedContentType.startsWith("video/")) return true;

  const extension = getLowerExtension(fileName);
  if (audioExtensions.has(extension)) return false;
  return videoExtensions.has(extension);
}

export function createExtractedAudioFileName(fileName) {
  const baseName = String(fileName || "media").replace(/\.[^.]*$/, "").trim() || "media";
  return `${baseName}.mp3`;
}

export function createAudioExtractionArgs(inputPath, outputPath) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
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

function getLowerExtension(fileName) {
  const match = String(fileName).toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}
