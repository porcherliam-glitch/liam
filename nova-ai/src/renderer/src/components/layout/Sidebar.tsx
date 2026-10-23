import { NavLink } from 'react-router';
import { FlaskConical, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useDaemonStore } from '../../stores/daemon';
import { useUiStore } from '../../stores/ui';
import { NAV_GROUPS } from './nav';

/** NOVA logo mark (gradient square with an "N"). */
export function NovaLogo({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-nova-gradient shadow-md shadow-violet/30', className)}>
      <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 19V5l12 14V5" />
      </svg>
    </span>
  );
}

/** "Demo-Daten" marker shown when the mock bridge is active (plain browser, no Electron). */
export function DemoRibbon({ collapsed }: { collapsed: boolean }) {
  const demo = useUiStore((s) => s.demo);
  if (!demo) return null;
  const text = 'Kein Hintergrunddienst verbunden – es werden Beispieldaten angezeigt. Änderungen bleiben nur in diesem Fenster.';
  return (
    <div
      role="note"
      title={text}
      className={cn('mx-2 mb-2 flex items-center gap-2 rounded-lg border border-warning/35 bg-warning/10 text-warning-fg', collapsed ? 'justify-center px-0 py-1.5' : 'px-2.5 py-1.5')}
    >
      <FlaskConical aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {collapsed ? <span className="sr-only">Demo-Daten. {text}</span> : <span className="text-[11px] leading-tight font-semibold">Demo-Daten</span>}
    </div>
  );
}

/** Collapsible left navigation with the pending approvals badge. */
export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const pending = useDaemonStore((s) => s.pendingApprovals);
  const version = useDaemonStore((s) => s.appVersion);

  return (
    <aside
      className={cn('flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150', collapsed ? 'w-[60px]' : 'w-56')}
      aria-label="Seitenleiste"
    >
      <div className={cn('flex h-14 shrink-0 items-center gap-2.5 border-b border-border', collapsed ? 'justify-center px-0' : 'px-4')}>
        <NovaLogo />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-bold tracking-wide">
              NOVA <span className="text-nova-gradient">AI</span>
            </p>
            <p className="truncate text-[11px] text-muted">Entwicklungsstudio</p>
          </div>
        )}
      </div>

      <nav aria-label="Hauptnavigation" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && 'mt-3 border-t border-border/70 pt-3')}>
            <p className="sr-only">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const badge = item.badge === 'approvals' ? pending : 0;
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.end}
                      title={collapsed ? `${item.label}${badge ? ` (${badge} offen)` : ''}` : undefined}
                      aria-label={badge ? `${item.label}, ${badge} offen` : undefined}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex h-9 items-center gap-2.5 rounded-lg text-[13px] font-medium no-underline transition-colors duration-150 hover:no-underline',
                          collapsed ? 'justify-center px-0' : 'px-2.5',
                          isActive ? 'bg-violet/14 text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full bg-nova-gradient" />}
                          <Icon aria-hidden className={cn('h-4 w-4 shrink-0', isActive ? 'text-violet-fg' : 'text-muted group-hover:text-text')} />
                          {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                          {badge > 0 &&
                            (collapsed ? (
                              <span aria-hidden className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-warning ring-2 ring-surface" />
                            ) : (
                              <span aria-hidden className="min-w-5 rounded-full bg-warning px-1.5 text-center text-[11px] leading-[18px] font-semibold text-black tabular-nums">
                                {badge > 99 ? '99+' : badge}
                              </span>
                            ))}
                        </>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <DemoRibbon collapsed={collapsed} />
      <div className={cn('flex h-11 shrink-0 items-center border-t border-border', collapsed ? 'justify-center' : 'justify-between pr-2 pl-4')}>
        {!collapsed && <span className="text-[11px] text-subtle">{version ? `Version ${version}` : ''}</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
          title={collapsed ? 'Seitenleiste ausklappen' : 'Seitenleiste einklappen'}
          aria-expanded={!collapsed}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-text"
        >
          {collapsed ? <PanelLeftOpen aria-hidden className="h-4 w-4" /> : <PanelLeftClose aria-hidden className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
