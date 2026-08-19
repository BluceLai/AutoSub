# whisper.cpp Windows 安裝筆記

日期：2026-08-19

這份文件說明 AutoSub 離線轉錄 PoC 需要的 `whisper.cpp` 安裝方式。目標不是把整套工具打包進 repo，而是讓本機能找到 `whisper-cli` 與 multilingual 模型檔，之後 AutoSub 就能呼叫它產生字幕。

## whisper.cpp 是什麼

`whisper.cpp` 是 OpenAI Whisper 語音辨識模型的 C/C++ 推論實作。它可以在本機離線執行，不需要把音訊送到 OpenAI API。對 AutoSub 來說，它的價值是：

- 可離線轉錄公司內部影片。
- 有 `whisper-cli`，Node server 可以用 subprocess 呼叫。
- CLI 可輸出 SRT / VTT / TXT / JSON，能接進目前字幕編輯器。
- 模型是單一檔案，比 Python 環境容易交付給 1 到 2 人使用。

限制也要先知道：

- 繁體中文不是獨立語言代碼，CLI 會用 `zh`；輸出可能仍需人工修正或後處理。
- CPU-only 模式會比雲端慢，模型越大越慢。
- 第一版建議先用 `base` 或 `small` multilingual，不要用 `.en` 模型。

## 建議安裝路線

### 1. 建立本機工具資料夾

```powershell
New-Item -ItemType Directory -Force C:\AutoSubTools\whisper.cpp
New-Item -ItemType Directory -Force C:\AutoSubTools\models
```

### 2. 下載 Windows CLI

從 `whisper.cpp` GitHub Releases 下載 Windows x64 CPU 版：

```text
https://github.com/ggml-org/whisper.cpp/releases/download/v1.8.6/whisper-bin-x64.zip
```

解壓縮到：

```text
C:\AutoSubTools\whisper.cpp
```

解壓後請確認資料夾內有：

```text
whisper-cli.exe
```

### 3. 下載 multilingual 模型

建議先用 `small`，品質通常比 `base` 好，檔案約 466 MiB。若電腦較慢，可先用 `base`，檔案約 142 MiB。

```text
https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

存放到：

```text
C:\AutoSubTools\models\ggml-small.bin
```

### 4. 設定 PATH 與模型路徑

把 `whisper-cli.exe` 所在資料夾加入使用者 PATH：

```powershell
[Environment]::SetEnvironmentVariable(
  "Path",
  [Environment]::GetEnvironmentVariable("Path", "User") + ";C:\AutoSubTools\whisper.cpp",
  "User"
)
```

設定 AutoSub 使用的模型路徑：

```powershell
[Environment]::SetEnvironmentVariable(
  "AUTOSUB_WHISPER_CPP_MODEL",
  "C:\AutoSubTools\models\ggml-small.bin",
  "User"
)
```

如果 PATH 尚未刷新，也可以明確設定 CLI 路徑：

```powershell
[Environment]::SetEnvironmentVariable(
  "AUTOSUB_WHISPER_CPP_CLI",
  "C:\AutoSubTools\whisper.cpp\Release\whisper-cli.exe",
  "User"
)
```

重新開一個 PowerShell 後檢查：

```powershell
where.exe whisper-cli
npm run offline:check
```

### 5. 手動 smoke test

先把 AutoSub 產生的 10 秒 MP3 樣本轉成 16 kHz mono WAV：

```powershell
ffmpeg -y -i "samples\output\TwinCAT HMI教育訓練【Section1 第4集】跳頁功能-0s-10s.mp3" -ar 16000 -ac 1 -c:a pcm_s16le samples\output\offline-smoke.wav
```

再用 `whisper-cli` 產生字幕：

```powershell
whisper-cli -m "C:\AutoSubTools\models\ggml-small.bin" -f samples\output\offline-smoke.wav -l zh -osrt -ovtt -oj -of samples\output\offline-smoke
```

預期會產生：

```text
samples\output\offline-smoke.srt
samples\output\offline-smoke.vtt
samples\output\offline-smoke.json
```

## 官方編譯路線

若不使用 release zip，也可以照官方 quick start 自行編譯：

```powershell
git clone https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build
cmake --build build -j --config Release
```

目前這台電腦尚未在 PATH 偵測到 `cmake`，所以 AutoSub 第一輪 PoC 建議先用 release zip。

## AutoSub 下一步整合

1. UI 加入「本機離線」模式。
2. 後端檢查 `whisper-cli` 與 `AUTOSUB_WHISPER_CPP_MODEL`。
3. 用現有 ffmpeg pipeline 轉成 WAV。
4. 呼叫 `whisper-cli -l zh -osrt -oj`。
5. 解析產出的 SRT 進入現有字幕編輯器。

## 來源

- [ggml-org/whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md)
- [ggml-org/whisper.cpp Releases](https://github.com/ggml-org/whisper.cpp/releases)
- [ggml-org/whisper.cpp models README](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)
- [ggerganov/whisper.cpp models on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
