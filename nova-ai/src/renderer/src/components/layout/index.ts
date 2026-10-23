// App frame. Pages use <Page>; the rest is wired up in App.tsx / routes.tsx.
export { AppShell } from './AppShell';
export { Page } from './Page';
export type { PageProps } from './Page';
export { Sidebar, NovaLogo, DemoRibbon } from './Sidebar';
export { TopBar, DaemonStatusPill, ApprovalsButton } from './TopBar';
export { NotificationsMenu } from './NotificationsMenu';
export { OperationsMenu } from './OperationsMenu';
export { NAV_GROUPS, NAV_ITEMS, navLabelFor } from './nav';
export type { NavItem, NavGroup } from './nav';
export { default as NotFoundPage } from './NotFoundPage';
