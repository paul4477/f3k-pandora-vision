const normalizeOcrText = (text) => text
  .toUpperCase()
  .replace(/[’‘`´]/g, "'")
  .replace(/[“”]/g, '"')
  .replace(/[|]/g, '1')
  .replace(/\s+/g, ' ')
  .trim();

const pad2 = (value) => value.toString().padStart(2, '0');

const parseGroupAndRound = (text) => {
  const compact = text.replace(/\s+/g, '');
  const match = compact.match(/(\d{2})([A-Z])\d?/);
  return { round: match?.[1] ?? null, group: match?.[2] ?? null };
};

const timePattern = /(\d{1,2})\s*[:.]\s*(\d{2})\s*['′]?\s*(\d{2})\s*["″]?\s*(\d)/g;

export function parseTimingText(rawText) {
  const text = normalizeOcrText(rawText);
  const { group, round } = parseGroupAndRound(text);
  const times = [];
  let match;

  while ((match = timePattern.exec(text)) !== null) {
    const position = Number(match[1]);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    const tenths = Number(match[4]);
    if (seconds > 59 || tenths > 9) continue;
    times.push({ position, raw: match[0], formatted: `${minutes}:${pad2(seconds)}.${tenths}`, minutes, seconds, tenths });
  }

  return { group, round, times, rawText };
}
