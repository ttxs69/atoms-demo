-- 撤销 003 最初的方向：RLS 必须 ENABLE，不能 DISABLE。
-- otp_codes 是登录凭证，任何客户端（anon/authenticated）都永远不可读。
-- 服务端走 service_role key（BYPASSRLS），无需任何 policy——零 policy = 默认拒绝。

ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- 保留格式约束（与安全无关，但无害）
ALTER TABLE public.otp_codes
  DROP CONSTRAINT IF EXISTS otp_code_format;
ALTER TABLE public.otp_codes
  ADD CONSTRAINT otp_code_format CHECK (code ~ '^\d{6}$');
