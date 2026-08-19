import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createRetranscriptionConfirmationMessage,
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
});
