/**
 * Strips AI-generated preamble and postamble from content.
 *
 * AI assistants often wrap their output with conversational filler like
 * "Sure, here is the article:" or "Let me know if you'd like changes!".
 * This function removes that filler while preserving the actual content.
 */

const PREAMBLE_PREFIXES = [
  "sure",
  "here is",
  "here's",
  "here are",
  "here you go",
  "below is",
  "below are",
  "i'll",
  "certainly",
  "of course",
  "okay,",
  "okay!",
  "ok,",
  "ok!",
  "great",
  "absolutely",
  "i've",
  "i have",
  "the following",
  "as requested",
  "per your",
];

const POSTAMBLE_PREFIXES = [
  "let me know",
  "would you like",
  "i hope",
  "feel free",
  "if you'd like",
  "i can also",
  "happy to",
  "shall i",
  "want me",
  "is there anything",
  "please let",
  "do you want",
  "should i",
  "i'm happy",
  "don't hesitate",
];

function isPreambleLine(line: string): boolean {
  const lower = line.trim().toLowerCase();
  if (lower === "" || lower === "---") return true;
  return PREAMBLE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function isContentStart(line: string): boolean {
  const trimmed = line.trim();
  // Heading
  if (/^#{1,6}\s/.test(trimmed)) return true;
  // Gutenberg block
  if (trimmed.startsWith("<!-- wp:")) return true;
  return false;
}

function isPostambleLine(line: string): boolean {
  const lower = line.trim().toLowerCase();
  if (lower === "" || lower === "---") return true;
  return POSTAMBLE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function stripAiCommentary(input: string): string {
  const lines = input.split("\n");

  // Find first real content line from the top
  let firstReal = 0;
  for (let i = 0; i < lines.length; i++) {
    // If we hit a content start marker, that's our first real line
    if (isContentStart(lines[i])) {
      firstReal = i;
      break;
    }
    // If the line is a preamble pattern or blank/divider, skip it
    if (isPreambleLine(lines[i])) {
      firstReal = i + 1;
      continue;
    }
    // Otherwise it's real content (a plain paragraph, etc.)
    firstReal = i;
    break;
  }

  // Find last real content line from the bottom
  let lastReal = lines.length - 1;
  for (let i = lines.length - 1; i >= firstReal; i--) {
    if (isPostambleLine(lines[i])) {
      lastReal = i - 1;
      continue;
    }
    // It's real content
    lastReal = i;
    break;
  }

  // Guard: if lastReal < firstReal, return empty
  if (lastReal < firstReal) return "";

  return lines.slice(firstReal, lastReal + 1).join("\n").trim();
}
