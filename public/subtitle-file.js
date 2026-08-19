export function parseSubtitleFile(content) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalized.split(/\n{2,}/);
  const segments = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trimEnd())
      .filter((line) => line.trim() !== "");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1) continue;

    const [startRaw, endRaw] = lines[timingIndex].split("-->").map((part) => part.trim().split(/\s+/)[0]);
    const start = parseSubtitleTime(startRaw);
    const end = parseSubtitleTime(endRaw);
    const text = lines
      .slice(timingIndex + 1)
      .join("\n")
      .trim();

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) continue;
    segments.push({
      index: segments.length + 1,
      start,
      end,
      text,
    });
  }

  if (segments.length === 0) {
    throw new Error("字幕檔內沒有可匯入的字幕段。");
  }

  return segments;
}

function parseSubtitleTime(value) {
  const match = value.match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!match) return Number.NaN;

  const [, hours = "0", minutes, seconds, milliseconds] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000;
}
