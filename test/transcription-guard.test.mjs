import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createCloudTranscriptionConfirmationMessage,
  createRetranscriptionConfirmationMessage,
  createTranscriptionConfirmationMessage,
  formatConfirmationDuration,
  shouldConfirmLongMedia,
  shouldConfirmRetranscription,
} from "../public/transcription-guard.js";

describe("transcription guard", () => {
  it("does not ask for confirmation when there are no subtitles", () => {
    assert.equal(shouldConfirmRetranscription([]), false);
  });

  it("asks for confirmation when subtitles already exist", () => {
    assert.equal(shouldConfirmRetranscription([{ id: "first" }]), true);
  });

  it("explains that retranscription replaces existing subtitles", () => {
    assert.equal(
      createRetranscriptionConfirmationMessage("demo.mp4", 4),
      "目前「demo.mp4」已有 4 段字幕。重新產生會用新的轉錄結果取代目前字幕，確定要繼續嗎？",
    );
  });

  it("warns before sending extracted audio to OpenAI", () => {
    assert.equal(
      createCloudTranscriptionConfirmationMessage("demo.mp4", true),
      "產生字幕會把「demo.mp4」的本機抽出的音訊送到 OpenAI 雲端轉錄。API key 只留在本機 server，不會送到瀏覽器。若內容包含不可外傳的隱私或機密資訊，請按取消。確定要繼續嗎？",
    );
  });

  it("warns before sending audio files to OpenAI", () => {
    assert.equal(
      createCloudTranscriptionConfirmationMessage("voice.wav", false),
      "產生字幕會把「voice.wav」的這個音訊檔送到 OpenAI 雲端轉錄。API key 只留在本機 server，不會送到瀏覽器。若內容包含不可外傳的隱私或機密資訊，請按取消。確定要繼續嗎？",
    );
  });

  it("asks for extra confirmation for media longer than the threshold", () => {
    assert.equal(shouldConfirmLongMedia(59.9), false);
    assert.equal(shouldConfirmLongMedia(60), false);
    assert.equal(shouldConfirmLongMedia(60.1), true);
  });

  it("formats confirmation durations", () => {
    assert.equal(formatConfirmationDuration(10), "10 秒");
    assert.equal(formatConfirmationDuration(620), "10 分 20 秒");
  });

  it("combines cloud, replacement, and long media warnings into one message", () => {
    assert.equal(
      createTranscriptionConfirmationMessage({
        fileName: "training.mp4",
        extractsAudio: true,
        segmentCount: 4,
        durationSeconds: 620,
      }),
      [
        "產生字幕會把「training.mp4」的本機抽出的音訊送到 OpenAI 雲端轉錄。API key 只留在本機 server，不會送到瀏覽器。若內容包含不可外傳的隱私或機密資訊，請按取消。確定要繼續嗎？",
        "目前已有 4 段字幕，重新產生會用新的轉錄結果取代目前字幕。",
        "目前媒體長度約 10 分 20 秒，線上轉錄會依音訊長度消耗用量。正式測試建議先用 10 秒音訊樣本。",
      ].join("\n\n"),
    );
  });

  it("explains offline transcription mode without cloud upload wording", () => {
    assert.equal(
      createTranscriptionConfirmationMessage({
        fileName: "training.mp4",
        extractsAudio: true,
        engine: "offline",
        segmentCount: 2,
        durationSeconds: 620,
      }),
      [
        "產生字幕會在本機使用 whisper.cpp 離線轉錄「training.mp4」，不會把音訊送到 OpenAI。",
        "目前已有 2 段字幕，重新產生會用新的轉錄結果取代目前字幕。",
        "目前媒體長度約 10 分 20 秒，本機離線轉錄會花較長時間，請保持 AutoSub 服務開啟。",
      ].join("\n\n"),
    );
  });
});
