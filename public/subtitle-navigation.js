export function getSubtitleJumpTarget(segments, currentTime, direction, activeSegmentId = null) {
  if (segments.length === 0) return null;

  const activeIndex = activeSegmentId ? segments.findIndex((segment) => segment.id === activeSegmentId) : -1;
  if (activeIndex !== -1) {
    const targetIndex = direction === "next" ? activeIndex + 1 : activeIndex - 1;
    return segments[targetIndex]?.start ?? null;
  }

  if (direction === "next") {
    const nextSegment = segments.find((segment) => segment.start > currentTime);
    return nextSegment?.start ?? null;
  }

  const previousSegment = segments.findLast((segment) => segment.start < currentTime);
  return previousSegment?.start ?? null;
}
