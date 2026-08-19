const progressViews = new Map([
  ["queued", { label: "等待處理", percent: 5, indeterminate: false, status: "轉錄工作已建立，等待本機 server 處理..." }],
  ["preparing", { label: "準備檔案", percent: 12, indeterminate: false, status: "正在準備檔案..." }],
  ["extracting-audio", { label: "本機抽取音訊", percent: 30, indeterminate: true, status: "正在用 ffmpeg 抽出低流量音訊..." }],
  ["preparing-audio", { label: "準備音訊", percent: 35, indeterminate: false, status: "音訊檔已準備完成..." }],
  ["uploading-openai", { label: "送 OpenAI 轉錄", percent: 60, indeterminate: true, status: "正在送 OpenAI 辨識並產生時間碼..." }],
  ["building-subtitles", { label: "建立字幕段落", percent: 90, indeterminate: false, status: "正在把轉錄結果轉成可編輯字幕..." }],
  ["complete", { label: "完成", percent: 100, indeterminate: false, status: "字幕已產生完成。" }],
  ["failed", { label: "轉錄失敗", percent: 100, indeterminate: false, status: "轉錄失敗。" }],
]);

export function getTranscriptionProgressView(event) {
  const view = progressViews.get(event?.stage) ?? progressViews.get("queued");
  return {
    ...view,
    percent: Number.isFinite(Number(event?.percent)) ? Number(event.percent) : view.percent,
    status: event?.message || view.status,
  };
}
