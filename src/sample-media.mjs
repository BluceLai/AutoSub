import { basename, extname, join, resolve } from "node:path";

export function parseSampleArgs(args) {
  const result = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--source") {
      result.source = next;
      index += 1;
    } else if (arg.startsWith("--source=")) {
      result.source = arg.slice("--source=".length);
    } else if (arg === "--duration") {
      result.duration = nonNegativeNumber(next, "duration");
      index += 1;
    } else if (arg.startsWith("--duration=")) {
      result.duration = nonNegativeNumber(arg.slice("--duration=".length), "duration");
    } else if (arg === "--start") {
      result.start = nonNegativeNumber(next, "start");
      index += 1;
    } else if (arg.startsWith("--start=")) {
      result.start = nonNegativeNumber(arg.slice("--start=".length), "start");
    } else if (arg === "--output") {
      result.output = next;
      index += 1;
    } else if (arg.startsWith("--output=")) {
      result.output = arg.slice("--output=".length);
    } else if (arg === "--output-dir") {
      result.outputDir = next;
      index += 1;
    } else if (arg.startsWith("--output-dir=")) {
      result.outputDir = arg.slice("--output-dir=".length);
    } else if (arg === "--audio-only") {
      result.audioOnly = true;
    }
  }

  return result;
}

export function createSampleOutputPath({ source, outputDir, output, start, duration, audioOnly }) {
  if (output) return resolve(output);

  const extension = audioOnly ? ".mp3" : ".mp4";
  return resolve(outputDir, `${stripExtension(basename(source))}-${start}s-${duration}s${extension}`);
}

export function createSampleMediaArgs({ source, start, duration, output, audioOnly }) {
  const commonArgs = ["-hide_banner", "-y", "-ss", String(start), "-i", source, "-t", String(duration)];

  if (audioOnly) {
    return [...commonArgs, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", output];
  }

  return [...commonArgs, "-map", "0:v:0?", "-map", "0:a:0?", "-c", "copy", "-movflags", "+faststart", output];
}

export function stripExtension(fileName) {
  const extension = extname(fileName);
  return extension ? fileName.slice(0, -extension.length) : fileName;
}

export function getDefaultSampleOutputDir(rootDir) {
  return join(rootDir, "samples", "output");
}

function nonNegativeNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`--${name} must be a non-negative number.`);
  }
  return parsed;
}
