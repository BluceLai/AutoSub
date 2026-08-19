import { findCommand } from "./command-path.mjs";

export const offlineEngineCandidates = [
  {
    id: "whisper-cpp",
    label: "whisper.cpp",
    commands: ["whisper-cli"],
    commandEnv: "AUTOSUB_WHISPER_CPP_CLI",
    modelEnv: "AUTOSUB_WHISPER_CPP_MODEL",
    outputFormats: ["srt", "vtt", "txt", "json"],
  },
  {
    id: "faster-whisper",
    label: "faster-whisper",
    commands: ["faster-whisper"],
    modelEnv: "AUTOSUB_FASTER_WHISPER_MODEL",
    outputFormats: ["srt", "vtt", "txt", "json"],
  },
];

export async function createOfflineEngineReport({
  env = process.env,
  commandLookup = (command) => findCommand(command),
} = {}) {
  const engines = [];

  for (const candidate of offlineEngineCandidates) {
    const commandPath = await findFirstAvailableCommand(candidate.commands, commandLookup);
    const configuredCommandPath = normalizeEnvValue(env[candidate.commandEnv]);
    const modelPath = normalizeEnvValue(env[candidate.modelEnv]);
    const resolvedCommandPath = configuredCommandPath ?? commandPath;
    const status = resolvedCommandPath ? (modelPath ? "ready" : "needs-model") : "missing-command";

    engines.push({
      ...candidate,
      commandPath: resolvedCommandPath,
      modelPath,
      status,
    });
  }

  return {
    engines,
    preferred: selectPreferredOfflineEngine({ engines }),
  };
}

export function selectPreferredOfflineEngine(report) {
  const engines = report?.engines ?? [];
  return (
    engines.find((engine) => engine.id === "whisper-cpp" && engine.status === "ready") ??
    engines.find((engine) => engine.status === "ready") ??
    engines.find((engine) => engine.id === "whisper-cpp") ??
    engines[0] ??
    null
  );
}

export function createOfflineCheckSummary(report) {
  return (report?.engines ?? [])
    .map((engine) => `${engine.label}: ${createEngineStatusMessage(engine)}`)
    .join("\n");
}

export function createWhisperCppWavArgs(inputPath, outputPath) {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ];
}

export function createWhisperCppArgs({
  modelPath,
  audioPath,
  outputBasePath,
  language = "zh",
  prompt = "",
}) {
  const args = ["-m", modelPath, "-f", audioPath, "-l", language];
  if (prompt) args.push("--prompt", prompt);
  return [...args, "-osrt", "-ovtt", "-oj", "-of", outputBasePath];
}

function createEngineStatusMessage(engine) {
  if (engine.status === "ready") {
    return `可用，CLI=${engine.commandPath}，模型=${engine.modelPath}`;
  }

  if (engine.status === "needs-model") {
    return `已找到 CLI=${engine.commandPath}，但尚未設定 ${engine.modelEnv}`;
  }

  return `未找到 CLI，請先安裝並確認 PATH 可找到 ${engine.commands.join(" 或 ")}`;
}

async function findFirstAvailableCommand(commands, commandLookup) {
  for (const command of commands) {
    const commandPath = await commandLookup(command);
    if (commandPath) return commandPath;
  }
  return null;
}

function normalizeEnvValue(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}
