'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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

interface ProjectFile {
  path: string;
  bytes: number;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  useEffect(() => {
    void (async () => {
      const me = await fetch('/api/auth/me').then((r) => r.json());
      if (!me.user) {
        router.push('/login');
        return;
      }
      setUserEmail(me.user.email);

      const res = await fetch(`/api/projects/${id}`);
      if (!res.ok) {
        setError('项目不存在或无权限');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as { project: Project; files: ProjectFile[] };
      setProject(data.project);
      setFiles(data.files);
      setNameDraft(data.project.name);
      setLoading(false);
    })();
  }, [id, router]);

  const signOut = async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    router.push('/');
  };

  const saveName = async () => {
    if (!project || nameDraft === project.name) {
      setEditingName(false);
      return;
    }
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nameDraft }),
    });
    if (res.ok) {
      setProject({ ...project, name: nameDraft });
    }
    setEditingName(false);
  };

  const archive = async () => {
    if (!confirm('归档后 7 天内可恢复。确定归档？')) return;
    await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    router.push('/projects');
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">加载中…</div>
    );
  }
  if (error || !project) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Card><CardContent className="pt-6 text-destructive">{error}</CardContent></Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="flex items-center gap-2 px-4 h-12">
          <a href="/" className="text-base font-semibold tracking-tight">
            Forge<span className="text-primary">.</span>
          </a>
          <div className="flex-1" />
          <a
            href="/projects"
            className="inline-flex items-center justify-center h-7 px-2.5 text-sm rounded-md hover:bg-accent"
          >
            ← 我的项目
          </a>
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

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            {editingName ? (
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveName();
                  if (e.key === 'Escape') {
                    setNameDraft(project.name);
                    setEditingName(false);
                  }
                }}
                autoFocus
                className="text-2xl font-semibold border-b border-input bg-transparent outline-none w-full"
              />
            ) : (
              <h1
                className="text-2xl font-semibold cursor-text hover:bg-accent rounded px-1 -mx-1"
                onClick={() => setEditingName(true)}
                title="点击改名"
              >
                {project.name}
              </h1>
            )}
            <div className="text-xs text-muted-foreground mt-1 flex gap-3 items-center">
              <span>{project.file_count} 个文件</span>
              <Badge variant="secondary">{project.status}</Badge>
              {project.last_opened_at ? (
                <span>最后打开：{new Date(project.last_opened_at).toLocaleString('zh-CN')}</span>
              ) : null}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setEditingName(true)}>改名</Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void archive()}>
              归档
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-4">
            <h2 className="text-sm font-medium mb-2">文件</h2>
            {files.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有文件</p>
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {files.map((f) => (
                  <div key={f.path} className="flex items-center justify-between px-2 py-1 hover:bg-accent rounded">
                    <span>{f.path}</span>
                    <span className="text-muted-foreground">{f.bytes}B</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {project.preview_url ? (
          <Card>
            <CardContent className="pt-4">
              <h2 className="text-sm font-medium mb-2">预览</h2>
              <div className="aspect-video border rounded bg-muted">
                <iframe src={project.preview_url} className="w-full h-full" title={project.name} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                预览 URL：<a href={project.preview_url} target="_blank" rel="noopener noreferrer" className="underline">{project.preview_url}</a>
              </p>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}