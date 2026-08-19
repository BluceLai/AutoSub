const minDurationSeconds = 0.4;
const longDurationSeconds = 7;
const fastReadingUnitsPerSecond = 9;
const overlapToleranceSeconds = 0.02;

export function getSubtitleQualityIssues(segments) {
  const issues = [];
  const orderedSegments = [...segments].sort((left, right) => left.start - right.start);

  for (const [index, segment] of orderedSegments.entries()) {
    const duration = segment.end - segment.start;
    const label = `第 ${index + 1} 段`;
    const text = String(segment.text ?? "").trim();

    if (!text) {
      issues.push(createIssue(segment, "error", "empty-text", label, "文字空白"));
    }

    if (duration <= 0) {
      issues.push(createIssue(segment, "error", "invalid-duration", label, "結束時間早於開始時間"));
      continue;
    }

    if (index > 0) {
      const previous = orderedSegments[index - 1];
      if (segment.start < previous.end - overlapToleranceSeconds) {
        issues.push(createIssue(segment, "error", "overlap", label, "與上一段時間重疊"));
      }
    }

    if (duration < minDurationSeconds) {
      issues.push(createIssue(segment, "warning", "too-short", label, `時間太短：${duration.toFixed(2)} 秒`));
    }

    if (duration > longDurationSeconds) {
      issues.push(createIssue(segment, "info", "too-long", label, `時間偏長：${duration.toFixed(1)} 秒`));
    }

    const readingSpeed = estimateReadingUnits(text) / duration;
    if (text && readingSpeed > fastReadingUnitsPerSecond) {
      issues.push(createIssue(segment, "warning", "fast-reading", label, `閱讀速度偏快：${readingSpeed.toFixed(1)} 單位/秒`));
    }
  }

  return issues;
}

function createIssue(segment, severity, kind, label, message) {
  return {
    id: `${segment.id}:${kind}`,
    segmentId: segment.id,
    severity,
    kind,
    label,
    message,
  };
}

function estimateReadingUnits(text) {
  const units = String(text).trim().match(/[A-Za-z0-9'-]+|[\u4e00-\u9fff]|[^\s]/g);
  if (!units) return 0;

  return units.reduce((sum, unit) => {
    if (/^[A-Za-z0-9'-]+$/.test(unit)) return sum + Math.max(1, unit.length * 0.35);
    if (/^[，。、「」『』；：？！,.!?;:()[\]{}"“”‘’]$/.test(unit)) return sum + 0.25;
    return sum + 1;
  }, 0);
}
