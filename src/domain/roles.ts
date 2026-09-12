/**
 * The three roles that ship in the MVP.
 *
 * A role is declarative configuration — instructions, a tool whitelist, and a
 * model. Adding a role means adding a config, not changing dispatch code.
 *
 * Only `eng` (Alex) may write files. That is enforced by the tool whitelist,
 * not by convention.
 */
export type AgentHandle = 'lead' | 'pm' | 'eng';

/**
 * Display names. The agent team is the product-layer fiction over a supervisor
 * plus role configs; this is the only place the names are written down.
 */
export const AGENT_NAMES: Readonly<Record<AgentHandle, string>> = {
  lead: 'Mike',
  pm: 'Emma',
  eng: 'Alex',
};

export const AGENT_ROLE_LABELS: Readonly<Record<AgentHandle, string>> = {
  lead: '团队负责人',
  pm: '产品经理',
  eng: '工程师',
};
