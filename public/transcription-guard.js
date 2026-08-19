export function shouldConfirmRetranscription(segments) {
  return Array.isArray(segments) && segments.length > 0;
}

export function createRetranscriptionConfirmationMessage(fileName, segmentCount) {
  const safeName = String(fileName || "目前影片");
  const count = Math.max(0, Number(segmentCount) || 0);
  return `目前「${safeName}」已有 ${count} 段字幕。重新產生會用新的轉錄結果取代目前字幕，確定要繼續嗎？`;
}
