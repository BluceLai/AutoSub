import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { findCommand } from "../src/command-path.mjs";

describe("command path lookup", () => {
  it("finds commands on PATH", async () => {
    const tempDir = await createTempDir();
    try {
      const commandPath = join(tempDir, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
      await writeFile(commandPath, "");

      assert.equal(
        await findCommand("ffmpeg", {
          pathValue: tempDir,
          platform: process.platform,
          pathext: ".EXE",
          localAppData: "",
        }),
        commandPath,
      );
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });

  it("finds WinGet-installed commands when PATH is not refreshed", async () => {
    const tempDir = await createTempDir();
    try {
      const packageDir = join(tempDir, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe");
      await mkdir(packageDir, { recursive: true });
      const commandPath = join(packageDir, "ffmpeg.exe");
      await writeFile(commandPath, "");

      assert.equal(
        await findCommand("ffmpeg", {
          pathValue: "",
          platform: "win32",
          pathext: ".EXE",
          localAppData: tempDir,
        }),
        commandPath,
      );
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});

async function createTempDir() {
  return mkdir(join(tmpdir(), `autosub-test-${crypto.randomUUID()}`), { recursive: true });
}
