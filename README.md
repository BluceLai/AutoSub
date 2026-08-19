# AutoSub

本機運行的自動字幕工具。第一版目標是「選擇影片或音訊檔、產生繁體中文字幕、播放器預覽、編輯字幕文字與時間、匯出 SRT」。

## 需求

- Node.js 22 或更新版本
- OpenAI API key

## 啟動

1. 建立 `.env.local`

   ```text
   OPENAI_API_KEY=sk-your-api-key
   # PORT 可省略；省略時會自動挑一個可用 port
   PORT=
   ```

2. 啟動本機網站，可以雙擊 `Start AutoSub.cmd`，或在終端機執行：

   ```bash
   npm run dev
   ```

3. 啟動後終端機會顯示實際網址，例如 `http://127.0.0.1:51234`。如果用 `Start AutoSub.cmd`，瀏覽器會自動打開。

## 目前功能

- 選擇本機影片或音訊檔
- 在瀏覽器中預覽影片
- 呼叫 OpenAI Audio Transcriptions API 產生字幕
- 顯示上傳與轉錄處理進度
- 播放時同步顯示目前字幕
- 點字幕時間跳轉播放
- 編輯字幕文字、開始時間、結束時間
- 刪除字幕段
- 匯出 `.srt`
- 從 UI 按「結束服務」關閉本機 server，關閉前會先確認

## 設計取捨

這版先做本機工具，不做登入、雲端保存、多人協作或付費。影片檔只在本機瀏覽器與本機 Node server 間流動；轉錄時會把選取的檔案送到 OpenAI Audio Transcriptions API。

時間碼第一版使用 `whisper-1` 的 `verbose_json` segment timestamps，因為目前 `gpt-4o-transcribe` 系列只支援 JSON 文字輸出，不適合作為需要 SRT 時間軸的第一版核心。
