# 08 — 雲端 / 離線轉錄模式切換

**What to build:** UI 可選 OpenAI 雲端或本機離線，兩種模式最後都產出同樣的字幕段落格式，並進入同一套字幕編輯器。

**Blocked by:** 02 — 影片先抽音訊再轉錄; 07 — 離線轉錄 PoC.

**Status:** done

- [x] UI 可選擇轉錄引擎。
- [x] 雲端與離線結果會轉成同一種字幕段落資料。
- [x] 未安裝離線模型時，UI 顯示可理解的狀態。
- [x] 切換模式不影響字幕編輯、預覽與匯出。

## Verification

- 2026-08-19: `npm run check` passed with 78 tests.
- 2026-08-19: `/api/health` reports `cloud.ready: false` without `OPENAI_API_KEY` and `offline.ready: true` with installed `whisper.cpp`.
- 2026-08-19: `/api/transcribe` in offline mode generated subtitles from the 10-second MP3 without OpenAI API key.
- 2026-08-19: `/api/transcribe-jobs` in offline mode returned `202` and emitted a `complete` SSE event with `model: whisper.cpp`.
