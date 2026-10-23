import type { LucideIcon } from 'lucide-react';
import { BookOpen, Bot, Box, Coins, Cpu, FolderKanban, LayoutDashboard, ListTodo, ScrollText, Settings, ShieldQuestion, Wrench } from 'lucide-react';
import { paths } from '../../lib/paths';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Shows the pending approvals badge. */
  badge?: 'approvals';
  /** Match only the exact path (dashboard). */
  end?: boolean;
}

export interface NavGroup {
  /** Visually hidden group label (screen readers). */
  label: string;
  items: NavItem[];
}

/** Sidebar navigation (UI-SPEC §2). */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Arbeit',
    items: [
      { path: paths.dashboard, label: 'Übersicht', icon: LayoutDashboard, end: true },
      { path: paths.projects, label: 'Projekte', icon: FolderKanban },
      { path: paths.agents, label: 'Agenten', icon: Bot },
      { path: paths.tasks, label: 'Aufgaben', icon: ListTodo },
      { path: paths.approvals, label: 'Freigaben', icon: ShieldQuestion, badge: 'approvals' },
      { path: paths.threed, label: '3D-Werkstatt', icon: Box },
    ],
  },
  {
    label: 'Ressourcen',
    items: [
      { path: paths.models, label: 'Modelle', icon: Cpu },
      { path: paths.costs, label: 'Kosten', icon: Coins },
      { path: paths.knowledge, label: 'Wissen', icon: BookOpen },
      { path: paths.integrations, label: 'Werkzeuge', icon: Wrench },
    ],
  },
  {
    label: 'System',
    items: [
      { path: paths.settings, label: 'Einstellungen', icon: Settings },
      { path: paths.logs, label: 'Protokolle', icon: ScrollText },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Navigation label for a pathname (fallback page title). */
export function navLabelFor(pathname: string): string | null {
  if (pathname === '/' || pathname === '') return 'Übersicht';
  const match = NAV_ITEMS.filter((i) => i.path !== '/' && (pathname === i.path || pathname.startsWith(`${i.path}/`))).sort((a, b) => b.path.length - a.path.length)[0];
  return match?.label ?? null;
}
