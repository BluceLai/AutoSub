import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findCommand } from "../src/command-path.mjs";
import { createSampleMediaArgs, createSampleOutputPath, getDefaultSampleOutputDir, parseSampleArgs } from "../src/sample-media.mjs";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");

const defaultSource =
  "C:\\Bluce\\99_installfile\\TwinCAT HMI\\Tim教學TE2000 TwinCAT HMI\\TwinCAT HMI教育訓練【Section1 第4集】跳頁功能.mp4";

const options = parseOptions(process.argv.slice(2));
const source = resolve(options.source ?? defaultSource);
const duration = options.duration ?? 20;
const start = options.start ?? 0;
const outputDir = resolve(options.outputDir ?? getDefaultSampleOutputDir(rootDir));
const output = createSampleOutputPath({
  source,
  outputDir,
  output: options.output,
  start,
  duration,
  audioOnly: Boolean(options.audioOnly),
});

if (!existsSync(source)) {
  fail(`Source video not found:\n${source}\n\nPass another file with --source "C:\\path\\video.mp4".`);
}

await mkdir(outputDir, { recursive: true });

const ffmpeg = await findCommand("ffmpeg");
if (!ffmpeg) {
  fail(
    [
      "ffmpeg was not found on PATH.",
      "",
      "Install ffmpeg first, then run this again:",
      "  winget install Gyan.FFmpeg",
      "",
      "After installation, reopen the terminal so PATH is refreshed.",
    ].join("\n"),
  );
}

const args = createSampleMediaArgs({
  source,
  start,
  duration,
  output,
  audioOnly: Boolean(options.audioOnly),
});

console.log(`Source: ${source}`);
console.log(`Output: ${output}`);
console.log(`Range: ${start}s to ${start + duration}s`);

await run(ffmpeg, args);
console.log(
  options.audioOnly
    ? "Done. Use this short audio sample for the smallest online transcription smoke test."
    : "Done. Use this short clip in AutoSub to avoid spending transcription tokens on the full video.",
);

function parseOptions(args) {
  try {
    return parseSampleArgs(args);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", rejectRun);
    child.on("close", (code) => {
      if (code === 0) {
        resolveRun();
        return;
      }
      rejectRun(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
