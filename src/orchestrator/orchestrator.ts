import type { AgentHandle } from '../domain/roles.ts';
import type { ForgeEvent } from '../domain/events.ts';
import type { CreditsPort, ModelMessage, ModelPort, SandboxPort } from '../ports/ports.ts';

export interface OrchestratorDeps {
  sandbox: SandboxPort;
  model: ModelPort;
  credits: CreditsPort;
}

export interface Orchestrator {
  /**
   * Run one generation turn for a session and stream what happens.
   *
   * This is the single seam the whole generation loop is tested at. It knows
   * nothing about HTTP and nothing about React — everything from role dispatch
   * to skeleton-first timing to bounded self-repair lives behind this call.
   */
  run(sessionId: string, userInput: string): AsyncIterable<ForgeEvent>;
}

/**
 * Ticket 01 reaches only as far as `understanding`: Mike receives the input and
 * responds. Everything downstream — Emma planning, Alex writing, install,
 * build, preview — is filled in by later tickets.
 */
export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  let messageCounter = 0;

  return {
    async *run(sessionId: string, userInput: string): AsyncIterable<ForgeEvent> {
      // Mike owns the turn until a later ticket adds dispatch to Emma.
      const agentHandle: AgentHandle = 'lead';
      const messageId = `msg-${++messageCounter}`;

      yield { type: 'agent_started', agentHandle, messageId };

      const messages: ModelMessage[] = [{ role: 'user', content: userInput }];

      for await (const chunk of deps.model.stream(agentHandle, messages)) {
        if (chunk.type === 'text') {
          yield { type: 'text_delta', agentHandle, delta: chunk.delta };
        }
      }

      yield { type: 'agent_done', agentHandle, creditsUsed: 0 };
    },
  };
}

export type { AgentHandle };
