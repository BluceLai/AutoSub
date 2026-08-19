import { minSegmentDurationSeconds } from "./subtitle-timing.js";

export function getSubtitleInsertSlot(segments, previousSegmentId, nextSegmentId, minimumDuration = minSegmentDurationSeconds) {
  const previousIndex = segments.findIndex((segment) => segment.id === previousSegmentId);
  if (previousIndex === -1) return null;

  const nextIndex = previousIndex + 1;
  const previous = segments[previousIndex];
  const next = segments[nextIndex];
  if (!next || next.id !== nextSegmentId) return null;

  const start = roundTime(previous.end);
  const end = roundTime(next.start);
  if (end - start < minimumDuration - 0.0001) return null;

  return {
    index: nextIndex,
    start,
    end,
  };
}

function roundTime(value) {
  return Math.round(value * 1000) / 1000;
}
