# 02 — 影片先抽音訊再轉錄

**What to build:** 使用者選影片後，AutoSub 先在本機用 ffmpeg 抽成低流量音訊，再送 OpenAI 產生字幕；音訊檔則直接送轉錄。這讓第一階段保留雲端辨識品質，同時減少影片上傳大小與格式不穩定造成的失敗。

**Blocked by:** 01 — 建立參考流程清單.

**Status:** implemented; needs ffmpeg-installed machine verification

- [x] 影片上傳會先轉成單聲道、低取樣率音訊後才呼叫轉錄 API。
- [x] 音訊檔上傳不會被重複抽音訊。
- [x] ffmpeg 不存在時回傳可理解的錯誤訊息。
- [x] 轉錄 API 回傳的字幕段落仍可進入目前編輯器。
- [x] 測試涵蓋影片/音訊判斷與 ffmpeg 參數。
