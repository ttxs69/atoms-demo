import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { z } from 'zod';
import type { AgentHandle } from '../domain/roles.ts';
import type { ModelChunk, ModelMessage, ModelPort } from './model-port.ts';

/**
 * Real model adapter backed by the AI SDK + Anthropic.
 *
 * Maps AI SDK stream parts onto our ModelChunk union so the orchestrator never
 * imports the AI SDK directly. The tool schema lives here rather than in the
 * orchestrator so the adapter can hand typed schemas to the model; the
 * orchestrator then receives `tool_call_start` / `tool_input_delta` /
 * `tool_call_end` events and executes the tools itself.
 */

const WRITE_FILE_TOOL = {
  description: 'Write or overwrite a file in the sandbox at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Relative path from the project root, e.g. src/App.tsx'),
    content: z.string().describe('Complete file content'),
  }),
};

/**
 * System instructions per role, trimmed to what the MVP needs.
 * These are intentionally terse — a richer prompt lives in ticket 04 when
 * Mike's dispatch and Emma's planning arrive.
 */
const ROLE_INSTRUCTIONS: Record<AgentHandle, string> = {
  lead: `You are Mike, a senior technical lead. Understand what the user wants to build and respond concisely.`,
  pm: `You are Emma, a product manager. Break down the user's request into a clear file list and description that Alex can build from.`,
  eng: `You are Alex, a full-stack engineer. Build the user's app using React, TypeScript, Tailwind, and shadcn/ui.
Write every file the app needs. Use write_file for each one. The stack is Vite + React + TypeScript + Tailwind + shadcn.`,
};

export class AnthropicModelAdapter implements ModelPort {
  readonly #apiKey: string;
  readonly #model: string;

  constructor(apiKey: string, model = 'claude-haiku-4-5-20251001') {
    this.#apiKey = apiKey;
    this.#model = model;
  }

  async *stream(
    agentHandle: AgentHandle,
    messages: readonly ModelMessage[],
  ): AsyncIterable<ModelChunk> {
    const anthropic = createAnthropic({ apiKey: this.#apiKey });
    const shared = {
      model: anthropic(this.#model),
      system: ROLE_INSTRUCTIONS[agentHandle],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    // The tool whitelist is part of the role's configuration: only `eng` may
    // write files. Branching here keeps the call shape honest instead of
    // passing an empty tool set that would read as "no tools available".
    const result =
      agentHandle === 'eng'
        ? streamText({ ...shared, tools: { write_file: WRITE_FILE_TOOL } })
        : streamText(shared);

    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          yield { type: 'text', delta: part.text };
          break;

        case 'tool-input-start':
          yield {
            type: 'tool_call_start',
            toolCallId: part.id,
            toolName: part.toolName,
          };
          break;

        case 'tool-input-delta':
          yield {
            type: 'tool_input_delta',
            toolCallId: part.id,
            argsDelta: part.delta,
          };
          break;

        case 'tool-input-end':
          yield { type: 'tool_call_end', toolCallId: part.id };
          break;

        default:
          // Other parts (reasoning, finish, metadata) are not surfaced.
          break;
      }
    }
  }
}
