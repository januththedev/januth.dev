/**
 * Quote-aware tokenizer for the JN shell.
 * Handles 'single', "double" quotes, backslash escapes outside quotes,
 * and emits '|' as its own PIPE token for pipelines.
 */

export const PIPE = '|';

export type Token = { kind: 'word'; value: string } | { kind: 'pipe' };

export function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let buf = '';
  let started = false;

  const flush = () => {
    if (started) tokens.push({ kind: 'word', value: buf });
    buf = '';
    started = false;
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === '|') {
      flush();
      tokens.push({ kind: 'pipe' });
      i++;
      continue;
    }

    if (ch === ' ' || ch === '\t') {
      flush();
      i++;
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      started = true; // '' and "" are real, empty arguments
      let closed = false;
      while (i < input.length) {
        if (input[i] === quote && quote === '"' && input[i - 1] === '\\') {
          buf = buf.slice(0, -1) + '"';
          i++;
          continue;
        }
        if (input[i] === quote) {
          closed = true;
          i++;
          break;
        }
        buf += input[i];
        started = true;
        i++;
      }
      if (!closed) return null; // unterminated quote
      continue;
    }

    if (ch === '\\') {
      i++;
      if (i < input.length) {
        buf += input[i];
        started = true;
        i++;
      }
      continue;
    }

    buf += ch;
    started = true;
    i++;
  }
  flush();
  return tokens;
}
