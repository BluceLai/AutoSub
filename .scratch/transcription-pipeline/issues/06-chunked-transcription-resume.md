# 06 — 長影片分段與續跑

**What to build:** 長影片可切段處理，某一段失敗時不用整支重跑，可以從已完成段落後面繼續，降低重複用量與等待風險。

**Blocked by:** 03 — 參考 whatSub 式階段進度; 04 — 避免重複產生字幕.

**Status:** implemented; needs API-key long-media verification

- [x] 長影片轉錄可以依固定時間區間分段。
- [x] 每段完成後可保存中間結果。
- [x] 失敗後可從未完成段落續跑。
- [x] 合併後的字幕時間碼仍對齊原影片時間。
- [ ] 尚未用真實 OpenAI API key 跑長影片驗證。

## Verification

- 2026-08-19: `npm run check` passed with 67 tests.
- 2026-08-19: local server health check passed on a floating port with `hasFfmpeg: true`.
- 2026-08-19: missing `OPENAI_API_KEY` request returned before transcription, so no OpenAI usage occurred.
- 2026-08-19: `npm run sample:audio` produced a 10-second MP3 sample for minimal online smoke testing.
