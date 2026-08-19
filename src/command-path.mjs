import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { delimiter, join } from "node:path";

export async function findCommand(command, options = {}) {
  const platform = options.platform ?? process.platform;
  const pathValue = options.pathValue ?? process.env.PATH ?? process.env.Path ?? "";
  const pathext = options.pathext ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM";
  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
  const pathEntries = pathValue.split(delimiter).filter(Boolean);
  const extensions = platform === "win32" ? pathext.split(";").filter(Boolean) : [""];

  for (const pathEntry of pathEntries) {
    for (const candidate of createCommandCandidates(pathEntry, command, extensions, platform)) {
      if (existsSync(candidate)) return candidate;
    }
  }

  if (platform === "win32") {
    return findWingetCommand(command, localAppData);
  }

  return null;
}

function createCommandCandidates(directory, command, extensions, platform) {
  if (platform !== "win32") return [join(directory, command)];

  const commandLower = command.toLowerCase();
  return extensions.flatMap((extension) => {
    if (commandLower.endsWith(extension.toLowerCase())) return [join(directory, command)];
    return [join(directory, `${command}${extension.toLowerCase()}`), join(directory, `${command}${extension.toUpperCase()}`)];
  });
}

async function findWingetCommand(command, localAppData) {
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
