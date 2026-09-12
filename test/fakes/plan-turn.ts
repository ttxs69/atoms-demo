import type { ScriptedTurn } from './fake-model.ts';

/**
 * A scripted pm conversation: narrate + call plan_files, then a closing
 * text step (the generation loop ends when a step calls no tools).
 */
export function planTurn(
  files: string[],
  description = 'Build the app.',
): ScriptedTurn[] {
  return [
    [
      { type: 'text', delta: description },
      { type: 'tool_call_start', toolCallId: 'p1', toolName: 'plan_files' },
      {
        type: 'tool_input_delta',
        toolCallId: 'p1',
        argsDelta: JSON.stringify({ files, description }),
      },
      { type: 'tool_call_end', toolCallId: 'p1' },
    ],
    [{ type: 'text', delta: 'plan confirmed' }],
  ];
}
