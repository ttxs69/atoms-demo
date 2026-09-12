import type { AgentHandle } from '../../src/domain/roles.ts';
import type { ModelChunk, ModelMessage, ModelPort } from '../../src/ports/model-port.ts';

/** A scripted turn: the chunks one agent yields when called once. */
export type ScriptedTurn = readonly ModelChunk[];

/**
 * A model whose responses are scripted per agent.
 *
 * Each agent's script is a queue of turns. Successive calls to `stream` for
 * that agent pop the next turn, so a test can script "first attempt writes X,
 * second attempt writes Y" — which is how the self-repair loop is driven.
 *
 * The same script always produces the same chunks. Nothing here is random or
 * time-dependent, which is what makes the whole suite deterministic and fast.
 */
export class FakeModel implements ModelPort {
  readonly calls: { agentHandle: AgentHandle; messages: readonly ModelMessage[] }[] = [];

  #scripts = new Map<AgentHandle, ScriptedTurn[]>();

  constructor(scripts: Partial<Record<AgentHandle, ScriptedTurn[]>>) {
    for (const [handle, turns] of Object.entries(scripts)) {
      if (turns) this.#scripts.set(handle as AgentHandle, [...turns]);
    }
  }

  /** Append another turn for an agent mid-test. */
  push(agentHandle: AgentHandle, turn: ScriptedTurn): void {
    const turns = this.#scripts.get(agentHandle) ?? [];
    turns.push(turn);
    this.#scripts.set(agentHandle, turns);
  }

  async *stream(
    agentHandle: AgentHandle,
    messages: readonly ModelMessage[],
  ): AsyncIterable<ModelChunk> {
    this.calls.push({ agentHandle, messages });

    const turn = this.#scripts.get(agentHandle)?.shift();
    if (!turn) {
      throw new Error(`FakeModel has no scripted turn left for agent "${agentHandle}"`);
    }
    for (const chunk of turn) yield chunk;
  }
}
