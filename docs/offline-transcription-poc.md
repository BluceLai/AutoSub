# AutoSub 離線轉錄 PoC 研究

日期：2026-08-19

範圍：只研究 ticket 07「離線轉錄 PoC」。比較 `whisper.cpp` 與 `faster-whisper` 在 Windows / 本機環境的安裝方式、執行需求、模型大小與來源、繁體中文可行性、CLI 字幕輸出、整合風險，並建議 AutoSub 第一個整合的離線引擎。

## 結論

建議 AutoSub 第一個離線引擎先整合 `whisper.cpp`。

理由是 `whisper.cpp` 和 AutoSub 目前的 Node 後端最容易接起來：它有獨立 `whisper-cli`、支援 Windows、可直接輸出 SRT / VTT / TXT / JSON / CSV / LRC，模型是單檔 `ggml` / `gguf` 風格資產，適合做「下載模型、呼叫 exe、解析輸出、匯入字幕」的第一版。它的模型大小與記憶體需求也清楚列在官方模型文件，`small` 約 466 MiB、`base` 約 142 MiB，對 1 到 2 人內部使用比較可控。

`faster-whisper` 仍值得保留為第二階段候選。它在官方 benchmark 中速度很強，尤其 GPU 與 batched mode 表現好，但本體是 Python library，不是第一方 CLI 字幕工具。若要整合到 AutoSub，需要包一層 Python worker 或採用第三方 CLI，Windows GPU 也要處理 CUDA / cuDNN / PATH 相容性，第一版的發佈與除錯成本會比較高。

## 候選比較

| 面向 | whisper.cpp | faster-whisper |
| --- | --- | --- |
| 專案定位 | OpenAI Whisper 的 C/C++ 高效推論實作，官方 README 明列 CPU-only、NVIDIA GPU、Vulkan、OpenVINO、Windows 等支援。來源：[whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md) | 使用 CTranslate2 的 Whisper 轉錄 library。來源：[faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md) |
| Windows 安裝 | 可用 CMake 建置 `whisper-cli`。官方 README 列 Windows MSVC / MinGW 支援；也有 Docker，但 Windows 本機 first pass 建議用 release exe 或自行 CMake。來源：[whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md) | `pip install faster-whisper`。需要 Python 3.9+；CPU 不需要系統 ffmpeg，因 PyAV 套件包含 FFmpeg library。來源：[faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md) |
| Windows GPU | 可用 CUDA / Vulkan / OpenVINO 等 build option，但若要最小整合，第一版可先 CPU-only。來源：[whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md) | GPU 需要 NVIDIA cuBLAS / cuDNN。faster-whisper README 指出新版 CTranslate2 對 CUDA / cuDNN 版本有要求；CTranslate2 官方文件也要求 Windows Python wheel 搭配 CUDA 12.x，speech recognition 類模型還需 cuDNN。來源：[faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md)、[CTranslate2 installation](https://opennmt.net/CTranslate2/installation.html) |
| CPU 需求 | 官方 README 標示支援 CPU-only；x86 有 AVX intrinsics。來源：[whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md) | CTranslate2 prebuilt binary 支援 x86-64 SSE 4.1 以上，並會依平台選擇 AVX / AVX2 / AVX512 等 backend。來源：[CTranslate2 hardware support](https://opennmt.net/CTranslate2/hardware_support.html) |
| 模型來源 | `models/download-ggml-model.sh` 下載轉好的 `ggml` 模型；官方模型表列 SHA 與大小，也連到 Hugging Face 的 `ggerganov/whisper.cpp` 模型集合。來源：[whisper.cpp models README](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md) | 以模型名稱載入時，會自動從 Hugging Face Hub 的 `Systran` namespace 下載 CTranslate2 模型；也可用 converter 從 Transformers / OpenAI Whisper 模型轉換。來源：[faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md) |
| 模型大小 | `tiny` 75 MiB、`base` 142 MiB、`small` 466 MiB、`medium` 1.5 GiB、`large` 2.9 GiB；`large-v3-turbo-q5_0` 547 MiB。來源：[whisper.cpp models README](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md) | Hugging Face 官方 Systran model tree 顯示 `faster-whisper-small` 約 486 MB，`faster-whisper-large-v3` 約 3.09 GB。來源：[Systran/faster-whisper-small](https://huggingface.co/Systran/faster-whisper-small/tree/main)、[Systran/faster-whisper-large-v3](https://huggingface.co/Systran/faster-whisper-large-v3/tree/main) |
| 繁中可行性 | Whisper 本身支援 `zh` Chinese；`whisper.cpp` CLI 有 `-l/--language` 可指定語言，並會把 language 傳給 Whisper params。來源：[OpenAI tokenizer](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py)、[whisper.cpp CLI source](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/cli.cpp) | 同樣基於 Whisper multilingual models。faster-whisper `transcribe()` 接受 `language` 參數，語言可由模型偵測或指定。來源：[faster-whisper transcribe source](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py)、[OpenAI tokenizer](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py) |
| 繁中注意點 | Whisper 只有 `zh` / Chinese，不保證輸出一定是繁體；可用 initial prompt / 後處理強化繁體用語。OpenAI tokenizer 也把中文類無空格語言用 Unicode token 切分，表示中文字級時間碼可行但仍需實測品質。來源：[OpenAI tokenizer](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py) | 同上。faster-whisper 有 `initial_prompt`、`word_timestamps` 等參數，可在 Python wrapper 內控制。來源：[faster-whisper transcribe source](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py) |
| 字幕輸出 | `whisper-cli` 官方 help 支援 `--output-srt`、`--output-vtt`、`--output-txt`、`--output-json`、`--output-csv`、`--output-lrc`，也支援 `--output-file`。來源：[whisper.cpp CLI source](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/cli.cpp) | faster-whisper README 展示的是 Python API，回傳 `segments` generator 與 `TranscriptionInfo`，沒有第一方 CLI 字幕 writer。官方 README 有列第三方工具，例如 `whisper-ctranslate2`、`whisper-standalone-win`，但這些不是 faster-whisper 本體。來源：[faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md) |
| 進度與取消 | CLI 有 `--print-progress`，source 內有 progress callback 與 abort callback 範例；AutoSub 可先讀 stdout/stderr 進度，後續再包 process kill。來源：[whisper.cpp CLI source](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/cli.cpp) | Python API 可由 worker 自行 emit 進度，但 faster-whisper 的 segments 是 generator，轉錄實際在迭代時開始；AutoSub 需要設計 Python subprocess protocol。來源：[faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md) |

## 安裝與執行需求

### whisper.cpp

Windows 本機最小路線：

1. 取得 `whisper.cpp` release binary 或在 Windows 用 CMake / MSVC 建置。
2. 下載 multilingual 模型，例如 `base` 或 `small`，不要用 `.en`。
3. 用 AutoSub 已有的 ffmpeg 把影片音訊轉成 `wav` 或直接餵 CLI 支援格式。
4. 呼叫：

```powershell
whisper-cli.exe -m models\ggml-small.bin -f input.wav -l zh -osrt -ovtt -oj -of output
```

官方 README 的 quick start 使用 CMake 建置，並提醒 `whisper-cli` 目前主要路線需要 16-bit WAV，可用 ffmpeg 轉成 `16000 Hz`、mono、`pcm_s16le`。官方 CLI source 也列出支援 `flac`、`mp3`、`ogg`、`wav`，但 AutoSub 第一版仍建議固定轉成 16 kHz mono WAV，減少格式差異。

硬體策略：

- 第一版：CPU-only，預設 `base` 或 `small` multilingual。
- 品質優先：`small` 起跳；如果 CPU 太慢再讓使用者選 `base`。
- 速度優先：後續可加 Vulkan / CUDA / OpenVINO build，但不要放進第一版交付核心。

### faster-whisper

Windows 本機最小路線：

1. 準備 Python 3.9+。
2. 安裝：

```powershell
python -m pip install faster-whisper
```

3. 寫一個 AutoSub 管理的 Python worker：

```python
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("input.mp3", beam_size=5, language="zh")
for segment in segments:
    print(segment.start, segment.end, segment.text)
```

4. Node 後端讀取 worker JSONL 或臨時 JSON，再轉成 AutoSub segments / SRT。

硬體策略：

- CPU：可行，但要驗證 RAM、速度與 Python wheel 相容性。
- GPU：Windows 需處理 CUDA / cuDNN / Visual C++ runtime / PATH。這對「其他人可用的版本」是主要風險。

## 繁體中文可行性

兩個候選都吃 Whisper multilingual model，所以基本中文語音辨識可行。OpenAI tokenizer 的語言表包含 `zh` Chinese，也包含 `yue` Cantonese；`mandarin` alias 會對應到 `zh`。這表示 AutoSub 可用 `language: "zh"` 或 CLI `-l zh` 指定中文。

但「繁體中文」不是 Whisper model 的明確語言代碼。風險是輸出可能混簡體、繁體或台灣專有詞不穩。第一版應該這樣處理：

- UI 顯示「中文（繁體偏好）」但 engine 參數仍傳 `zh`。
- 加 initial prompt，例如「請使用繁體中文、台灣用語、保留英文專有名詞」。
- 保留後處理空間：簡繁轉換、專有詞表、使用者自訂詞。
- ticket 07 真機測試時，用同一段 TwinCAT HMI 教學影片 20 秒，比較簡繁比例、專有名詞、時間碼穩定度。

## 整合風險

### whisper.cpp 風險

- 需要取得或建置 Windows executable；若沒有固定 release binary，AutoSub 發佈包要設計「第一次啟動下載 engine」或「使用者指定 whisper-cli.exe」。
- CLI 與模型檔路徑、空白與中文路徑要測 Windows escaping。
- CPU-only 大模型可能很慢；要在 UI 明確顯示模型大小、預估慢速與進度。
- 繁體輸出不保證，需要 prompt 或後處理。
- 若直接解析 SRT，可快速整合；若要字級拆分資料，應優先解析 JSON / JSON full。

### faster-whisper 風險

- 本體不是第一方 CLI；AutoSub 必須管理 Python runtime、虛擬環境、pip package、worker protocol。
- Windows GPU 相依性比 whisper.cpp CPU-only 複雜。CUDA / cuDNN 版本不合會讓使用者卡在環境設定。
- 模型從 Hugging Face 自動下載，第一次使用需要網路；完全離線發佈必須預先打包模型或提供模型匯入流程。
- 字幕輸出要自己寫 formatter，或採第三方 CLI；採第三方會增加供應鏈與維護面。
- segments 是 generator，若 worker 設計不好，UI 可能以為開始了但其實還沒迭代執行。

## 建議 AutoSub ticket 07 實作順序

1. `whisper.cpp` CPU-only PoC：支援使用者指定 `whisper-cli.exe` 與 `ggml-small.bin` / `ggml-base.bin`。
2. AutoSub 後端新增 offline engine probe：檢查 exe 是否存在、`--help` 是否可執行、模型檔是否存在。
3. 用現有 ffmpeg pipeline 產生 20 秒 16 kHz mono WAV。
4. 呼叫 `whisper-cli.exe -l zh -osrt -oj`，產出 SRT 與 JSON。
5. 解析 SRT 成現有字幕段，JSON 保留給未來字級功能。
6. 記錄本機測試表：模型、檔案大小、執行秒數、字幕段數、繁體/簡體情況、專有詞錯誤。
7. 第二輪才評估 faster-whisper Python worker，重點是速度與品質是否明顯值得承擔 Python 發佈成本。

Windows 安裝步驟另見：`docs/whisper-cpp-windows-setup.md`。

## PoC 驗收建議

| 項目 | whisper.cpp 第一版門檻 |
| --- | --- |
| 安裝 | 不要求使用者編譯；可指定 exe 與模型路徑 |
| 測試片段 | 使用同一段 20 秒 TwinCAT HMI 教學影片 |
| 模型 | `base` 與 `small` multilingual 至少測一個，不能用 `.en` |
| 語言 | 固定 `zh`，加繁中 initial prompt |
| 輸出 | 至少 SRT；建議同時產 JSON |
| UI | 顯示離線、模型、處理中、完成、失敗訊息 |
| 成功判定 | 可在無 `OPENAI_API_KEY` 情況下產生可匯入 AutoSub 的字幕段 |

## 第一手來源

- [ggml-org/whisper.cpp README](https://github.com/ggml-org/whisper.cpp/blob/master/README.md)
- [ggml-org/whisper.cpp models README](https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md)
- [ggml-org/whisper.cpp CLI source](https://github.com/ggml-org/whisper.cpp/blob/master/examples/cli/cli.cpp)
- [SYSTRAN/faster-whisper README](https://github.com/SYSTRAN/faster-whisper/blob/master/README.md)
- [SYSTRAN/faster-whisper transcribe source](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py)
- [SYSTRAN/faster-whisper setup.py](https://github.com/SYSTRAN/faster-whisper/blob/master/setup.py)
- [CTranslate2 installation docs](https://opennmt.net/CTranslate2/installation.html)
- [CTranslate2 hardware support docs](https://opennmt.net/CTranslate2/hardware_support.html)
- [OpenAI Whisper README](https://github.com/openai/whisper/blob/main/README.md)
- [OpenAI Whisper tokenizer](https://github.com/openai/whisper/blob/main/whisper/tokenizer.py)
- [OpenAI Whisper subtitle writer source](https://github.com/openai/whisper/blob/main/whisper/utils.py)
- [Systran/faster-whisper-small model tree](https://huggingface.co/Systran/faster-whisper-small/tree/main)
- [Systran/faster-whisper-large-v3 model tree](https://huggingface.co/Systran/faster-whisper-large-v3/tree/main)
