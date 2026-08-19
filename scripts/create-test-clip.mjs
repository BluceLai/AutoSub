import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { basename, delimiter, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");

const defaultSource =
  "C:\\Bluce\\99_installfile\\TwinCAT HMI\\Tim教學TE2000 TwinCAT HMI\\TwinCAT HMI教育訓練【Section1 第4集】跳頁功能.mp4";

const options = parseArgs(process.argv.slice(2));
const source = resolve(options.source ?? defaultSource);
const duration = options.duration ?? 20;
const start = options.start ?? 0;
const outputDir = resolve(options.outputDir ?? join(rootDir, "samples", "output"));
const output = resolve(
  options.output ?? join(outputDir, `${stripExtension(basename(source))}-${start}s-${duration}s.mp4`),
);

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

const args = [
  "-hide_banner",
  "-y",
  "-ss",
  String(start),
  "-i",
  source,
  "-t",
  String(duration),
  "-map",
  "0:v:0?",
  "-map",
  "0:a:0?",
  "-c",
  "copy",
  "-movflags",
  "+faststart",
  output,
];

console.log(`Source: ${source}`);
console.log(`Output: ${output}`);
console.log(`Range: ${start}s to ${start + duration}s`);

await run(ffmpeg, args);
console.log("Done. Use this short clip in AutoSub to avoid spending transcription tokens on the full video.");

function parseArgs(args) {
  const result = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--source") {
      result.source = next;
      index += 1;
    } else if (arg === "--duration") {
      result.duration = positiveNumber(next, "duration");
      index += 1;
    } else if (arg === "--start") {
      result.start = positiveNumber(next, "start");
      index += 1;
    } else if (arg === "--output") {
      result.output = next;
      index += 1;
    } else if (arg === "--output-dir") {
      result.outputDir = next;
      index += 1;
    }
  }

  return result;
}

function positiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    fail(`--${name} must be a positive number.`);
  }
  return parsed;
}

function stripExtension(fileName) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

async function findCommand(command) {
  const pathValue = process.env.PATH ?? process.env.Path ?? "";
  const pathEntries = pathValue.split(delimiter).filter(Boolean);
  const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];

  for (const pathEntry of pathEntries) {
    for (const extension of extensions) {
      const candidate = join(pathEntry, process.platform === "win32" ? `${command}${extension.toLowerCase()}` : command);
      if (existsSync(candidate)) return candidate;

      const upperCandidate = join(pathEntry, process.platform === "win32" ? `${command}${extension.toUpperCase()}` : command);
      if (existsSync(upperCandidate)) return upperCandidate;
    }
  }

  if (process.platform === "win32") {
    const wingetCommand = await findWingetCommand(command);
    if (wingetCommand) return wingetCommand;
  }

  return null;
}

async function findWingetCommand(command) {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return null;

  const packagesDir = join(localAppData, "Microsoft", "WinGet", "Packages");
  if (!existsSync(packagesDir)) return null;

  const queue = [packagesDir];
  while (queue.length > 0) {
    const currentDir = queue.shift();
    let entries = [];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === `${command}.exe`) {
        return fullPath;
      }
    }
  }

  return null;
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
