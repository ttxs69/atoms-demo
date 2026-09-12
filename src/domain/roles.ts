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
