'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Project {
  id: string;
  name: string;
  status: 'draft' | 'generating' | 'ready' | 'failed' | 'archived';
  preview_url: string | null;
  file_count: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const me = await fetch('/api/auth/me').then((r) => r.json());
        if (!me.user) {
          router.push('/login');
          return;
        }
        setUserEmail(me.user.email);

        const res = await fetch('/api/projects');
        const data = (await res.json()) as { projects?: Project[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? '加载失败');
          return;
        }
        setProjects(data.projects ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/');
  };

  const archive = async (id: string) => {
    if (!confirm('归档后 7 天内可恢复，之后会被清理。确定归档？')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    setProjects((prev) => (prev ?? []).filter((p) => p.id !== id));
  };

  const rename = async (id: string, currentName: string) => {
    const name = prompt('项目名', currentName);
    if (!name || name === currentName) return;
    await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setProjects((prev) =>
      (prev ?? []).map((p) => (p.id === id ? { ...p, name } : p)),
    );
  };

  const statusBadge = (s: Project['status']) => {
    if (s === 'ready') return <Badge variant="default" className="bg-emerald-500">运行中</Badge>;
    if (s === 'generating') return <Badge variant="default" className="bg-blue-500">生成中</Badge>;
    if (s === 'failed') return <Badge variant="destructive">失败</Badge>;
    return <Badge variant="secondary">{s}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex items-center gap-2 px-4 h-12">
          <a href="/" className="text-base font-semibold tracking-tight">
            Forge<span className="text-primary">.</span>
          </a>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={() => router.push('/?new=1')}>
            + 新建项目
          </Button>
          {userEmail ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90">
                {userEmail.charAt(0).toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">{userEmail}</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>退出登录</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold mb-6">我的项目</h1>

        {loading ? (
          <p className="text-muted-foreground">加载中…</p>
        ) : error ? (
          <Card>
            <CardContent className="pt-6 text-destructive">{error}</CardContent>
          </Card>
        ) : projects && projects.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <Card key={p.id} className="hover:bg-accent transition-colors">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <a href={`/projects/${p.id}`} className="font-medium hover:underline flex-1 truncate">
                      {p.name}
                    </a>
                    {statusBadge(p.status)}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div>{p.file_count} 个文件</div>
                    <div>
                      {p.last_opened_at
                        ? `最后打开：${relativeTime(p.last_opened_at)}`
                        : `创建：${relativeTime(p.created_at)}`}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5"
                      onClick={() => {
                        // 打开 = 回到工作现场（对话 + 预览 + 继续迭代），不是元数据详情页。
                        // 先 GET 详情顺手 bump last_opened_at —— 工作区水合与 generate 的
                        // resolveProject 都按它取“最近项目”，多项目未来同样正确。
                        void fetch(`/api/projects/${p.id}`).then(() => router.push('/'));
                      }}
                    >
                      打开
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void rename(p.id, p.name)}
                    >
                      改名
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void archive(p.id)}
                      className="text-destructive"
                    >
                      归档
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="pt-6 text-center space-y-3">
              <p className="text-muted-foreground">还没有项目</p>
              <Button onClick={() => router.push('/')}>开始第一个</Button>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}