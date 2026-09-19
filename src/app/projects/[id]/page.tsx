'use client';

import { useParams } from 'next/navigation';
import { Workspace } from '@/components/workspace.tsx';

/**
 * /projects/[id] —— 该项目的工作现场（对话 + 预览 + 代码）。
 * URL 即状态：刷新/深链按 id 水合（ChatGPT 约定），不再有隐式
 * "最近项目"解析。旧元数据详情页已退役：改名/归档在列表页，文件与
 * 预览在本页各自的窗格里。
 */
export default function ProjectWorkspacePage() {
  const params = useParams();
  return <Workspace projectId={params.id as string} />;
}
