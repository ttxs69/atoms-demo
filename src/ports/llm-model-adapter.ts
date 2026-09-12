import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { AgentHandle } from '../domain/roles.ts';
import type { ModelChunk, ModelMessage, ModelPort } from './model-port.ts';

/**
 * Provider-agnostic model adapter.
 *
 * The provider is env-driven, not pinned:
 *
 *   LLM_PROTOCOL   'openai' (default) or 'anthropic'
 *   LLM_BASE_URL   endpoint base
 *   LLM_API_KEY    key for that endpoint
 *   LLM_MODEL      model id
 *
 * This covers every provider configured in this machine's toolchain:
 *
 *   deepseek  openai       https://api.deepseek.com/v1
 *   glm       anthropic    https://open.bigmodel.cn/api/coding/paas/v4
 *   minimax   anthropic    https://api.minimaxi.com/anthropic
 *
 * Two of the three speak the Anthropic Messages protocol rather than
 * OpenAI-compatible chat completions, so both clients are supported. Tool
 * calling works through either; the stream-part mapping below is identical
 * because the AI SDK normalizes both to the same part shapes.
 */

const WRITE_FILE_TOOL = {
  description: 'Write or overwrite a file in the sandbox at the given path.',
  inputSchema: z.object({
    path: z.string().describe('Relative path from the project root, e.g. src/App.tsx'),
    content: z.string().describe('Complete file content'),
  }),
};

/**
 * System instructions per role. Intentionally terse — Mike's dispatch and
 * Emma's planning arrive with ticket 04, and richer prompts belong there.
 */
const ROLE_INSTRUCTIONS: Record<AgentHandle, string> = {
  lead: `You are Mike, a senior technical lead. Understand what the user wants to build and respond concisely.`,
  pm: `You are Emma, a product manager. Break down the user's request into a clear file list and description that Alex can build from.`,
  eng: `You are Alex, a full-stack engineer. Build the user's app using React, TypeScript, Tailwind, and shadcn/ui.
Write every file the app needs. Use write_file for each one. The stack is Vite + React + TypeScript + Tailwind + shadcn.`,
};

export interface LlmEnv {
  protocol: 'openai' | 'anthropic';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function createModelAdapter(env: LlmEnv): ModelPort {
  return new LlmModelAdapter(env);
}

class LlmModelAdapter implements ModelPort {
  readonly #model: LanguageModel;

  constructor(env: LlmEnv) {
    this.#model =
      env.protocol === 'anthropic'
        ? createAnthropic({ apiKey: env.apiKey, baseURL: env.baseUrl })(env.model)
        : createOpenAICompatible({
            name: 'forge-llm',
            apiKey: env.apiKey,
            baseURL: env.baseUrl,
          })(env.model);
  }

  async *stream(
    agentHandle: AgentHandle,
    messages: readonly ModelMessage[],
  ): AsyncIterable<ModelChunk> {
    const shared = {
      model: this.#model,
      system: ROLE_INSTRUCTIONS[agentHandle],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };

    // The tool whitelist is part of the role's configuration: only `eng` may
    // write files. Branching keeps the call shape honest instead of passing
    // an empty tool set that would read as "no tools available".
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
