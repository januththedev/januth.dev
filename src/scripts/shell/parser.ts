import { tokenize, type Token } from './tokenizer';

/**
 * Splits a token stream on pipes into individual commands.
 * Returns null when the line is empty or malformed.
 */

export interface PipedCmd {
  name: string;
  args: string[];
}

export function parse(line: string): PipedCmd[] | null {
  const tokens = tokenize(line);
  if (!tokens) return null;

  const segments: PipedCmd[] = [];
  let current: string[] = [];

  const pushSegment = () => {
    if (!current.length) return;
    segments.push({ name: current[0], args: current.slice(1) });
    current = [];
  };

  for (const t of tokens as Token[]) {
    if (t.kind === 'pipe') {
      if (!current.length) return null; // leading/trailing/double pipe
      pushSegment();
    } else {
      current.push(t.value);
    }
  }
  pushSegment();

  return segments.length ? segments : null;
}

/** levenshtein distance ≤2 suggestions for "did you mean…" */
export function suggest(word: string, candidates: string[]): string | null {
  let best: string | null = null;
  let bestDist = 3;
  for (const c of candidates) {
    const d = levenshtein(word.toLowerCase(), c.toLowerCase());
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}
