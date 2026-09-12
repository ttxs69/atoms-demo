import type { StreamEvent } from '../domain/events.ts';

/**
 * Server-sent events framing for the generation stream.
 *
 * Kept separate from the HTTP route so the framing can be tested as a pure
 * function — including the two cases that actually bite: multi-line content in
 * generated files, and events split across network chunks.
 *
 * The payload is JSON on a single `data:` line, so SSE's newline handling can
 * never corrupt multi-line file content.
 */

const DATA_PREFIX = 'data: ';
const SEPARATOR = '\n\n';

export function encodeEvent(event: StreamEvent): string {
  return `${DATA_PREFIX}${JSON.stringify(event)}${SEPARATOR}`;
}

export interface DecodeResult {
  events: StreamEvent[];
  /** An incomplete trailing event, to be prefixed onto the next chunk. */
  rest: string;
}

export function decodeEvents(buffer: string): DecodeResult {
  const events: StreamEvent[] = [];
  const parts = buffer.split(SEPARATOR);

  // The final part is either an incomplete event or an empty string when the
  // buffer ended exactly on a separator.
  const rest = parts.pop() ?? '';

  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith(DATA_PREFIX)) continue;
      events.push(JSON.parse(line.slice(DATA_PREFIX.length)) as StreamEvent);
    }
  }

  return { events, rest };
}
