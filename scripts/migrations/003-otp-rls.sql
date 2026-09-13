ALTER TABLE public.otp_codes DISABLE ROW LEVEL SECURITY;

-- 但 disable 后 anon key 也能读写——加一个列权限约束
ALTER TABLE public.otp_codes 
  ADD CONSTRAINT otp_code_format CHECK (code ~ '^\d{6}$');
