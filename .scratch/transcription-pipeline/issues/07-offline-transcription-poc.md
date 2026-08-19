# 07 — 離線轉錄 PoC

**What to build:** 做一個本機離線轉錄技術驗證，比較 whisper.cpp 與 faster-whisper 在這台電腦上的安裝難度、速度、模型大小與繁中辨識品質。

**Blocked by:** 01 — 建立參考流程清單.

**Status:** whisper.cpp PoC done; faster-whisper benchmark deferred

- [x] 文件列出至少兩個離線引擎候選。
- [x] 使用同一段 20 秒測試影片比較輸出結果。
- [x] 記錄 CPU/GPU 需求、模型大小、執行時間與字幕品質。
- [x] 明確建議第一個要整合的離線引擎。

## Verification

- 2026-08-19: `docs/offline-transcription-poc.md` compares `whisper.cpp` and `faster-whisper` using official sources.
- 2026-08-19: recommendation recorded: integrate `whisper.cpp` first, keep `faster-whisper` as a second-stage candidate.
- 2026-08-19: added `npm run offline:check`; initial probe showed no offline engine before installation.
- 2026-08-19: installed `whisper.cpp` v1.8.6 CPU binary and `ggml-small.bin` multilingual model under `C:\AutoSubTools`.
- 2026-08-19: `npm run offline:check` reports `whisper.cpp` ready from `.env.local`.
- 2026-08-19: generated offline subtitles from the 20-second TwinCAT sample in about 6.39 seconds.
- 2026-08-19: `parseSubtitleFile()` imported the generated SRT as 4 editable subtitle segments.
- Deferred: install and benchmark `faster-whisper` only if later speed/quality needs justify Python worker packaging.
