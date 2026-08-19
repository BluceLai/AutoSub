export function findSubtitleMatches(segments, query) {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const matches = [];
  segments.forEach((segment, segmentIndex) => {
    const haystack = String(segment.text ?? "");
    const normalizedHaystack = haystack.toLocaleLowerCase();
    let start = normalizedHaystack.indexOf(needle);

    while (start !== -1) {
      matches.push({
        segmentId: segment.id,
        segmentIndex,
        start,
        end: start + needle.length,
      });
      start = normalizedHaystack.indexOf(needle, start + needle.length);
    }
  });

  return matches;
}

export function replaceSubtitleMatch(segments, match, replacement) {
  return segments.map((segment) => {
    if (segment.id !== match.segmentId) return segment;

    const text = String(segment.text ?? "");
    return {
      ...segment,
      text: `${text.slice(0, match.start)}${replacement}${text.slice(match.end)}`,
    };
  });
}

export function replaceAllSubtitleMatches(segments, query, replacement) {
  const needle = query.trim();
  if (!needle) return segments;

  return segments.map((segment) => ({
    ...segment,
    text: String(segment.text ?? "").replaceAll(new RegExp(escapeRegExp(needle), "giu"), replacement),
  }));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
