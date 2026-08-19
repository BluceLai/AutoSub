export const timeWheelStepSeconds = 0.1;
export const minSegmentDurationSeconds = 0.1;

export function clampSegmentStart(segments, segmentId, value) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1) return 0;

  const segment = segments[index];
  const previous = segments[index - 1];
  const next = segments[index + 1];
  const minStart = previous ? previous.end : 0;
  const nextLimit = next ? next.start - minSegmentDurationSeconds : Infinity;
  const endLimit = segment.end - minSegmentDurationSeconds;
  const maxStart = Math.max(minStart, Math.min(endLimit, nextLimit));
  return roundToTenth(clampTime(value, minStart, maxStart));
}

export function clampSegmentEnd(segments, segmentId, value) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1) return 0;

  const segment = segments[index];
  const next = segments[index + 1];
  const maxEnd = next ? next.start : Infinity;
  const minEnd = Math.min(segment.start + minSegmentDurationSeconds, maxEnd);
  return roundToTenth(clampTime(value, minEnd, maxEnd));
}

export function clampSegmentShift(segments, segmentId, delta) {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index === -1) return 0;

  const segment = segments[index];
  const previous = segments[index - 1];
  const next = segments[index + 1];
  const minDelta = previous ? previous.end - segment.start : -segment.start;
  const maxDelta = next ? next.start - segment.end : Infinity;
  return roundToTenth(clampTime(delta, minDelta, maxDelta));
}

export function enforceNonOverlappingSegments(segments) {
  for (let index = 0; index < segments.length - 1; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (current.end > next.start) current.end = next.start;
    if (current.start > current.end) current.start = current.end;
  }
}

export function getWheelTimeDelta(deltaY) {
  return deltaY < 0 ? timeWheelStepSeconds : -timeWheelStepSeconds;
}

function clampTime(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}
