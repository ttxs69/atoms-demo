import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { streamText } from 'ai';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { AgentHandle } from '../domain/roles.ts';
import type {
  ModelChunk,
  ModelMessage,
  ModelPort,
  StepMessage,
} from './model-port.ts';

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

const PLAN_FILES_TOOL = {
  description:
    'Submit the implementation plan: every file the engineer must write.',
  inputSchema: z.object({
    files: z
      .array(z.string())
      .describe('File paths Alex must write, e.g. ["src/App.tsx", "src/components/MoodCard.tsx"]'),
    description: z.string().describe('One-paragraph summary of what the app does'),
  }),
};

/**
 * System instructions per role. Intentionally terse — Mike's dispatch and
 * Emma's planning arrive with ticket 04, and richer prompts belong there.
 */
const ROLE_INSTRUCTIONS: Record<AgentHandle, string> = {
  lead: `You are Mike, a senior technical lead. Understand what the user wants to build and respond concisely.`,
  pm: `You are Emma, a product manager. Turn the user's request into an implementation plan.

Always finish with ONE plan_files call listing EVERY file Alex must write:
- src/App.tsx first (it is required)
- then components/hooks the app needs, each under src/
- 3-6 files total for a small app; split big UIs into components
The scaffold (package.json, vite config, index.html, src/main.tsx, src/index.css) already exists — NEVER list it.
Keep the description one paragraph, in the user's language.`,
  eng: `You are Alex, a full-stack engineer. Build the user's app.

The project scaffold ALREADY EXISTS in the workspace: package.json, vite.config.ts (React + Tailwind v4), tsconfig.json, index.html, src/main.tsx (renders <App/>), src/index.css (@import "tailwindcss"). NEVER rewrite these.

Your job — write ONLY the app's own files under src/:
- src/App.tsx (REQUIRED — main.tsx imports it)
- Any components/hooks/types the app needs, also under src/

Rules:
- Imports are relative to each file's own location: from src/utils.ts import from './types' (NOT '../types'); from src/components/X.tsx import from '../types'.
- All state in React; data persists in localStorage when the app needs saving.
- Use Tailwind utility classes for all styling. No other libraries.
- Keep the app in Chinese if the user writes Chinese.`,
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
    messages: readonly (ModelMessage | StepMessage)[],
  ): AsyncIterable<ModelChunk> {
    const shared = {
      model: this.#model,
      system: ROLE_INSTRUCTIONS[agentHandle],
      // The AI SDK accepts plain and step messages in one array.
      messages: messages as Parameters<typeof streamText>[0]['messages'],
      // Multi-file scaffolds run 5-8k output tokens deep. The provider default
      // (4k on some models) truncates mid-turn — the app ends up missing its
      // biggest file and the build fails with a confusing error.
      maxOutputTokens: 8000,
    };

    // The tool whitelist is part of the role's configuration: only `eng` may
    // write files. Branching keeps the call shape honest instead of passing
    // an empty tool set that would read as "no tools available".
    // The tool whitelist is part of the role's configuration: only `eng` may
    // write files, only `pm` submits plans. Branching keeps the call shape
    // honest instead of passing an empty tool set that would read as "no
    // tools available".
    const toolsFor = (handle: AgentHandle) =>
      handle === 'eng'
        ? { write_file: WRITE_FILE_TOOL }
        : handle === 'pm'
          ? { plan_files: PLAN_FILES_TOOL }
          : undefined;

    const handle = agentHandle;
    const tools = toolsFor(handle);
    // One controlled cast: the SDK's overloads don't align with
    // exactOptionalPropertyTypes, and the whitelist above is what keeps
    // tool access honest.
    const result = streamText({
      ...shared,
      ...(tools ? { tools } : {}),
    } as Parameters<typeof streamText>[0]);

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

        case 'error':
          // Never swallow stream errors: an invalid prompt or provider failure
          // must surface, not masquerade as an empty response that ends the
          // generation loop as if the model had finished.
          throw part.error instanceof Error
            ? part.error
            : new Error(JSON.stringify(part.error));

        default:
          // Other parts (reasoning, finish, metadata) are not surfaced.
          break;
      }
    }
  }
}
