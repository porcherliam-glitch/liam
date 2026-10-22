import { File, FileBraces, FileCode, FileImage, FileText, Folder, FolderOpen, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

const CODE = new Set(['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'cs', 'py', 'go', 'rs', 'java', 'kt', 'cpp', 'c', 'h', 'hpp', 'gd', 'gdshader', 'shader', 'hlsl', 'glsl', 'html', 'css', 'scss', 'less', 'vue', 'svelte', 'php', 'rb', 'sh', 'ps1', 'bat', 'cmd', 'sql', 'lua', 'swift', 'dart']);
const DATA = new Set(['json', 'jsonc', 'yml', 'yaml', 'toml', 'xml', 'csproj', 'sln', 'asmdef', 'unity', 'prefab', 'meta', 'ini', 'cfg', 'env']);
const TEXT = new Set(['md', 'mdx', 'txt', 'log', 'csv', 'rst']);
const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'tga', 'psd']);

/** Color classes per file group (calm, matching the accents). */
const TONE: Record<'code' | 'data' | 'text' | 'image' | 'other', string> = {
  code: 'text-blue-fg',
  data: 'text-warning-fg',
  text: 'text-muted',
  image: 'text-success-fg',
  other: 'text-subtle',
};

function groupOf(name: string): keyof typeof TONE {
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (CODE.has(ext)) return 'code';
  if (DATA.has(ext)) return 'data';
  if (TEXT.has(ext)) return 'text';
  if (IMAGE.has(ext)) return 'image';
  return 'other';
}

const ICONS: Record<keyof typeof TONE, LucideIcon> = { code: FileCode, data: FileBraces, text: FileText, image: FileImage, other: File };

export interface FileIconProps {
  name: string;
  type?: 'file' | 'dir';
  open?: boolean;
  className?: string;
}

/** Small icon for a file or folder (decorative – always next to the name). */
export function FileIcon({ name, type = 'file', open, className }: FileIconProps) {
  if (type === 'dir') {
    const Icon = open ? FolderOpen : Folder;
    return <Icon aria-hidden className={cn('h-4 w-4 shrink-0 text-violet-fg/80', className)} />;
  }
  const group = groupOf(name);
  const Icon = ICONS[group];
  return <Icon aria-hidden className={cn('h-4 w-4 shrink-0', TONE[group], className)} />;
}
