# Test Samples

This folder is for small local test videos. Keep source videos and generated clips out of git.

## Current test template

Source video on this machine:

```text
C:\Bluce\99_installfile\TwinCAT HMI\Tim教學TE2000 TwinCAT HMI\TwinCAT HMI教育訓練【Section1 第4集】跳頁功能.mp4
```

The source video is about 71 MB. For early transcription tests, create a 20-second clip first so OpenAI transcription usage stays small.

## Create the 20-second clip

Install ffmpeg first if needed:

```powershell
winget install Gyan.FFmpeg
```

Then reopen the terminal and run:

```bash
npm run sample:clip
```

Or double-click:

```text
Create 20s Test Clip.cmd
```

The generated file is written under `samples/output/`, which is intentionally ignored by git.

You can choose another range:

```bash
node scripts/create-test-clip.mjs --start 60 --duration 20
```
