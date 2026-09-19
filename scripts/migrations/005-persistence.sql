-- 005: 对话与生成物持久化（docs/04-persistence.md）
-- seq = 重放游标（序列号语义）；turn_id = 幂等重写键（同一回合重试先删后插）。

ALTER TABLE public.project_events
  ADD COLUMN IF NOT EXISTS turn_id text,
  ADD COLUMN IF NOT EXISTS seq bigint GENERATED ALWAYS AS IDENTITY;

CREATE UNIQUE INDEX IF NOT EXISTS project_events_seq_idx ON public.project_events(seq);
CREATE INDEX IF NOT EXISTS project_events_turn_idx ON public.project_events(project_id, turn_id);

-- 快照桶（私有；service key 读写，RLS 不适用）。快照对象按 workspace_id 命名，
-- 与 GC 的 deletion_queue 键一致，GC 可直接按 workspace 删对象。
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-snapshots', 'project-snapshots', false)
ON CONFLICT (id) DO NOTHING;
