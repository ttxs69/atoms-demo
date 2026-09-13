CREATE TABLE IF NOT EXISTS public.otp_codes (
  email text PRIMARY KEY,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS otp_codes_expires_at_idx ON public.otp_codes(expires_at);

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- 服务端写入（service_role key），客户端不直接读
-- 不创建 SELECT policy：永远不允许客户端读 OTP

-- 自动删除过期 OTP：可以用 pg_cron 或 app 层 cleanup
