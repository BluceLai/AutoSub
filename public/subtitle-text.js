export function createSplitUnits(text) {
  return tokenizeText(text).map((unit) => ({
    text: unit.text,
    start: unit.start,
    canSplit: unit.start > 0 && (unit.kind === "word" || unit.kind === "character"),
    className: getSplitUnitClassName(unit),
  }));
}

export function estimateSpeechProgressRatio(text, splitIndex) {
  const units = tokenizeText(text);
  const totalWeight = units.reduce((sum, unit) => sum + getSpeechWeight(unit), 0);
  if (totalWeight <= 0) return 0.5;

  const elapsedWeight = units.reduce((sum, unit) => {
    const unitWeight = getSpeechWeight(unit);
    if (unit.end <= splitIndex) return sum + unitWeight;
    if (unit.start >= splitIndex) return sum;

    const partialRatio = (splitIndex - unit.start) / Math.max(1, unit.end - unit.start);
    return sum + unitWeight * partialRatio;
  }, 0);

  return clampRatio(elapsedWeight / totalWeight, 0.08, 0.92);
}

export function splitText(text) {
  const trimmed = text.trim();
  if (trimmed.length < 2) return [trimmed, "新增字幕", 1];

  const midpoint = Math.ceil(trimmed.length / 2);
  const punctuation = ["，", "。", "、", "；", ",", ".", ";", " "];
  const splitIndex = punctuation
    .flatMap((mark) => [trimmed.indexOf(mark, Math.max(1, midpoint - 6)), trimmed.lastIndexOf(mark, midpoint + 6)])
    .filter((index) => index > 0 && index < trimmed.length - 1)
    .sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint))[0];

  const index = splitIndex ?? midpoint;
  return [trimmed.slice(0, index + 1).trim(), trimmed.slice(index + 1).trim() || "新增字幕", index + 1];
}

function tokenizeText(text) {
  const characters = Array.from(text.trim());
  const units = [];
  let index = 0;

  while (index < characters.length) {
    const character = characters[index];
    const start = index;

    if (isWhitespace(character)) {
      let value = character;
      index += 1;
      while (index < characters.length && isWhitespace(characters[index])) {
        value += characters[index];
        index += 1;
      }
      units.push({ kind: "space", text: value, start, end: index });
      continue;
    }

    if (isAsciiWordCharacter(character)) {
      let value = character;
      index += 1;
      while (index < characters.length && isAsciiWordCharacter(characters[index])) {
        value += characters[index];
        index += 1;
      }
      units.push({ kind: "word", text: value, start, end: index });
      continue;
    }

    index += 1;
    units.push({
      kind: isPunctuation(character) ? "punctuation" : "character",
      text: character,
      start,
      end: index,
    });
  }

  return units;
}

function getSplitUnitClassName(unit) {
  if (unit.start === 0) return "is-leading";
  if (unit.kind === "space") return "is-space";
  if (unit.kind === "punctuation") return "is-punctuation";
  return "";
}

function getSpeechWeight(unit) {
  if (unit.kind === "space") return 0.08 * unit.text.length;
  if (unit.kind === "word") return Math.max(1.15, unit.text.length * 0.22);
  if (unit.kind === "punctuation") return 0.18;
  return 1;
}

function isWhitespace(character) {
  return /\s/.test(character);
}

function isAsciiWordCharacter(character) {
  return /^[A-Za-z0-9'-]$/.test(character);
}

function isPunctuation(character) {
  return /^[，。、「」『』；：？！,.!?;:()[\]{}"“”‘’]$/.test(character);
}

function clampRatio(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
