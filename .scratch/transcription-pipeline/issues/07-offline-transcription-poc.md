# 07 — 離線轉錄 PoC

**What to build:** 做一個本機離線轉錄技術驗證，比較 whisper.cpp 與 faster-whisper 在這台電腦上的安裝難度、速度、模型大小與繁中辨識品質。

**Blocked by:** 01 — 建立參考流程清單.

**Status:** research done; needs installed-engine benchmark

- [x] 文件列出至少兩個離線引擎候選。
- [ ] 使用同一段 20 秒測試影片比較輸出結果。
- [x] 記錄 CPU/GPU 需求、模型大小、執行時間與字幕品質。
- [x] 明確建議第一個要整合的離線引擎。

## Verification

- 2026-08-19: `docs/offline-transcription-poc.md` compares `whisper.cpp` and `faster-whisper` using official sources.
- 2026-08-19: recommendation recorded: integrate `whisper.cpp` first, keep `faster-whisper` as a second-stage candidate.
- 2026-08-19: added `npm run offline:check`; current machine does not yet expose `whisper-cli` or `faster-whisper` on PATH.
- Pending: install an offline engine/model, then run the same 20-second TwinCAT sample and record runtime plus subtitle quality.
