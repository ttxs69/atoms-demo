#!/bin/bash
# 一分钟修好 Supabase 邮件配置
set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Supabase 邮件模板改成 6 位数字码（OTP）——1 分钟搞定           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "原因：signInWithOtp 默认发的是带跳转链接的 magic link，"
echo "链接里用的 SITE_URL 是 localhost，所以点了之后跳到 localhost。"
echo "改成 OTP 模板（用 {{ .Token }}）后，发的是 6 位数字码，"
echo "用户直接粘到表单登录，不依赖 SITE_URL。"
echo ""

TEMPLATE_URL="https://supabase.com/dashboard/project/wxivajmhzvfmhjwzotiv/auth/templates/magic-link-or-otp"

echo "1. 打开这个链接："
echo "   $TEMPLATE_URL"
echo ""
echo "2. 找到 'Confirmation URL' 那段（默认是 <a href=\"{{ .ConfirmationURL }}\">点击登录</a>）"
echo ""
echo "3. 把整段替换成下面这段："
echo ""
cat <<'HTML'
<h2>登录 Forge</h2>
<p>你的验证码：</p>
<h1 style="font-size:32px;letter-spacing:8px;font-family:monospace">{{ .Token }}</h1>
<p>10 分钟内有效。Forge 不会向你索要其他信息。</p>
HTML
echo ""
echo "4. 点页面底部的 'Save' 按钮"
echo ""
echo "5. 回到 Forge 的 /login 重新点发送验证码，应该收到 6 位数字"
echo ""

# 自动打开
if [[ "$OSTYPE" == "darwin*" ]]; then
  read -p "按回车打开浏览器..."
  open "$TEMPLATE_URL"
fi