# AutoSub

本機運行的自動字幕工具。第一版目標是「選擇影片或音訊檔、產生繁體中文字幕、播放器預覽、編輯字幕文字與時間、匯出 SRT」。

## 需求

- Node.js 22 或更新版本
- OpenAI API key
- ffmpeg，影片轉錄時會先在本機抽出音訊
- 選用：離線轉錄 PoC 需要另外安裝 `whisper.cpp` 或 `faster-whisper`，目前建議先驗證 `whisper.cpp`

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
- 匯入 `.srt` / `.vtt` 字幕檔，直接進入預覽與編輯
- 載入測試字幕，不消耗 OpenAI 用量
- 影片檔會先用本機 ffmpeg 抽成音訊，再呼叫 OpenAI Audio Transcriptions API 產生字幕
- 音訊檔會直接呼叫 OpenAI Audio Transcriptions API 產生字幕
- 目前已有字幕段落時，重新產生字幕前會先要求確認，避免重複消耗 OpenAI 用量
- 顯示上傳與轉錄處理進度，包含本機抽音訊、送 OpenAI、建立字幕與完成階段
- 長影片會依固定時間區間分段轉錄，每段完成後保存文字與時間碼結果，失敗後可從未完成段落續跑
- 提供離線轉錄引擎偵測指令，可檢查這台電腦是否已安裝 `whisper.cpp` / `faster-whisper`
- 播放時同步顯示目前字幕
- 可開關跟隨播放，讓右側字幕列表自動對齊目前播放段落
- 顯示字幕品質檢查，提示時間重疊、過短、過長、文字空白與閱讀速度偏快
- 品質問題可用上一個 / 下一個快速定位，目標字幕會醒目提示
- 搜尋字幕文字，並可取代單筆或全部取代
- 點字幕時間跳轉播放
- 編輯字幕文字、開始時間、結束時間
- 拖曳「新增字幕段」到兩段字幕中間插入空白字幕，不會調整原本字幕時間
- 兩段字幕中間沒有可用時間時，無法插入新字幕
- 合併下一段
- 單段字幕可快速提前 / 延後 0.1 秒，整體字幕可提前 / 延後 0.1 或 0.5 秒
- 開始時間、結束時間、單段秒數長度可用滑鼠滾輪以 0.1 秒調整
- 非輸入框狀態可用上下方向鍵跳到上一段 / 下一段字幕，空白鍵播放或暫停
- 按住 `Ctrl` 時切換成逐字拆分視圖，移到文字上會放大醒目提示，點一下會從該文字前拆分，點到的文字會移到下一段
- 拆分字幕時會依中文單字、英文單字、標點與空白權重估算新時間點
- 字幕編輯支援 `復原` / `重做`，各保留最近 10 步
- 刪除字幕段
- 匯出 `.srt`、`.vtt`、`.txt`
- 本機自動儲存字幕專案
- 匯出 / 匯入 `.autosub.json` 專案檔
- 從 UI 按「結束服務」關閉本機 server，關閉前會先確認

## 專案保存

字幕段落會依照影片檔名、大小與修改時間自動保存在目前瀏覽器的 `localStorage`。重新選擇同一支影片時，AutoSub 會自動接回先前的字幕段落。

也可以按「匯出專案」下載 `.autosub.json`，之後選回影片再按「匯入專案」接回。專案檔只包含字幕段落與影片檔資訊，不包含影片本體。

## 隱私與 API key

- `OPENAI_API_KEY` 只由本機 Node server 從 `.env.local` 讀取，不會送到瀏覽器前端。
- `.env.local` 已列在 `.gitignore`，不要 commit 或分享這個檔案。
- 未按「產生字幕」前，影片/音訊只在本機瀏覽器與本機 Node server 間流動。
- 按「產生字幕」後，影片檔會先在本機抽出音訊，再把音訊送到 OpenAI Audio Transcriptions API；音訊檔則會直接送到 OpenAI。
- 內部測試請避免使用不可外傳的隱私或機密素材；若只要測 UI，可用「載入測試字幕」，不會消耗 OpenAI 用量，也不會送檔案到 OpenAI。

## 測試樣本

這個 repo 內有一個測試樣本準備工具，可以從指定影片截出短片，避免早期測試浪費完整影片的轉錄用量。

目前預設來源是本機這支影片：

```text
C:\Bluce\99_installfile\TwinCAT HMI\Tim教學TE2000 TwinCAT HMI\TwinCAT HMI教育訓練【Section1 第4集】跳頁功能.mp4
```

產生 20 秒測試片：

```bash
npm run sample:clip
```

也可以雙擊 `Create 20s Test Clip.cmd`。產出的短片會放在 `samples/output/`，不會被 git 追蹤。

產生 10 秒音訊測試樣本，用來做最小 OpenAI 線上轉錄 smoke test：

```bash
npm run sample:audio
```

也可以雙擊 `Create 10s Audio Test Sample.cmd`。正式測試 OpenAI 轉錄時，建議先用這個 10 秒 `.mp3`，確認 API key、上傳、轉錄、字幕顯示都正常後，再處理較長影片。

影片抽音訊與測試短片工具都需要先安裝 ffmpeg：

```powershell
winget install Gyan.FFmpeg
```

## 離線轉錄 PoC

目前離線模式仍在 PoC 階段，尚未接進 UI 的「產生字幕」。研究結論建議第一個整合 `whisper.cpp`，因為它有 Windows 可用的 CLI，能直接輸出 SRT / VTT / JSON，比 `faster-whisper` 少一層 Python worker 發佈成本。

檢查這台電腦是否已具備離線轉錄引擎：

```bash
npm run offline:check
```

`whisper.cpp` 若已安裝，請先讓 `whisper-cli` 可被 PATH 找到，並設定模型路徑：

```text
AUTOSUB_WHISPER_CPP_MODEL=C:\path\to\ggml-small.bin
```

完整比較與建議請看 `docs/offline-transcription-poc.md`。

## 驗證

執行純函式測試：

```bash
npm test
```

執行語法檢查與測試：

```bash
npm run check
```

## 設計取捨

這版先做本機工具，不做登入、雲端保存、多人協作或付費。影片檔只在本機瀏覽器與本機 Node server 間流動；影片轉錄時會先在本機抽出音訊，再把音訊送到 OpenAI Audio Transcriptions API。音訊檔則直接送到 OpenAI。離線轉錄目前只完成研究與本機環境偵測，尚未取代 OpenAI 主流程。

正式產生字幕時，瀏覽器會先把檔案上傳到本機 server，server 建立一個轉錄工作並用 server-sent events 回報階段進度。長影片會切成 5 分鐘一段逐段轉錄，每段完成後只保存轉錄文字與時間碼結果到 `.autosub-work/`，不保存影片或音訊。

時間碼第一版使用 `whisper-1` 的 `verbose_json` segment timestamps，因為目前 `gpt-4o-transcribe` 系列只支援 JSON 文字輸出，不適合作為需要 SRT 時間軸的第一版核心。

完整流程與參考影片式互動取捨請看 `docs/transcription-workflow.md`。
