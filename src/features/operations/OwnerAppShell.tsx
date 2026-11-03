import { useState, type ReactNode } from 'react';
import type { OwnerPage, OwnerNavGroup } from './ownerWorkspaceConfig';

type Props = {
  baseUrl: string;
  groups: OwnerNavGroup[];
  page: OwnerPage;
  displayName: string;
  onNavigate: (page: OwnerPage) => void;
  onSignOut: () => void;
  children: ReactNode;
};

function OwnerNavIcon({ name }: { name: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (name) {
    case 'dashboard':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><rect x="3.5" y="3.5" width="7" height="7" rx="1"/><rect x="13.5" y="3.5" width="7" height="7" rx="1"/><rect x="3.5" y="13.5" width="7" height="7" rx="1"/><rect x="13.5" y="13.5" width="7" height="7" rx="1"/></svg>;
    case 'orders':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><path d="M8 4.5h8M9 3h6v3H9z"/><rect x="5" y="4.5" width="14" height="17" rx="2"/><path d="m8 11 1.3 1.3L12 9.8M13.5 11H16M8 16l1.3 1.3L12 14.8M13.5 16H16"/></svg>;
    case 'menu':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><path d="M3 17.5h18v2H3zM5 17.5c.8-5.1 4-8 7-8s6.2 2.9 7 8M12 9.5V7M10.5 7h3"/><path d="M8 14.5h8"/></svg>;
    case 'employees':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.3A5.5 5.5 0 0 1 9 13.2a5.5 5.5 0 0 1 5.5 5.5V20z"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17 13.5a5 5 0 0 1 3.5 4.8V20h-3"/></svg>;
    case 'sales':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><path d="M3 20.5h18M5 17l5-5 3 2 6-7"/><path d="M14.5 7H19v4.5"/><rect x="4" y="16" width="3" height="4.5" rx=".5"/><rect x="10" y="14" width="3" height="6.5" rx=".5"/><rect x="16" y="11" width="3" height="9.5" rx=".5"/></svg>;
    case 'reports':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><path d="M6 3.5h9l4 4V21H6a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2z"/><path d="M15 3.5v4h4M8 17v-3M12 17v-6M16 17v-4"/></svg>;
    case 'loyalty':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><path d="m8 14-2 7 5-2.5L13 21l1.2-6.8"/><path d="m16 14 2 7-5-2.5L11 21"/><circle cx="12" cy="9" r="6.5"/><path d="m12 5.5 1.1 2.2 2.4.4-1.8 1.7.4 2.4-2.1-1.1-2.1 1.1.4-2.4-1.8-1.7 2.4-.4z"/></svg>;
    case 'pos':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01M7 13h4v4H7zM14 13h3M14 16h3"/></svg>;
    case 'settings':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="m19.4 13.5 1.1 1.9-2 3.4-2.2-.1-1.4 1.2-.4 2h-4l-.5-2-1.7-1.1-2 .1-2-3.4 1.1-1.9-.2-2-1.2-1.6 2-3.4 2.1.1 1.7-1.1.5-2h4l.4 2 1.7 1.1 2.1-.1 2 3.4-1.2 1.6z"/></svg>;
    case 'website':
      return <svg viewBox="0 0 24 24" width="18" height="18" {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 8h18M7 6h.01M10 6h.01M8 20v-7h8v7M11 13v3h2v-3M6 11h2M16 11h2"/></svg>;
    default:
      return null;
  }
}

function SupportIcon() {
  return <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 13v-1a8.5 8.5 0 0 1 17 0v1"/><rect x="3" y="12" width="4" height="7" rx="1.5"/><rect x="17" y="12" width="4" height="7" rx="1.5"/><path d="M17 19c-.7 1.4-2 2-4 2h-1"/></svg>;
}

export function OwnerAppShell({ groups, page, displayName, onNavigate, onSignOut, children }: Props) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  return <div className="owner-app">
    <div className="owner-layout">
      <aside id="owner-primary-navigation" className={`owner-sidebar${mobileNavOpen ? ' is-mobile-open' : ''}`} aria-label="Primary navigation">
        <div className="owner-sidebar-heading">
          <span className="owner-sidebar-brand" aria-label="Web2table">W<span>2</span>T</span>
        </div>
        <nav className="owner-sidebar-nav">
          {groups.map(group => <section className="owner-nav-group" key={group.label}><h2>{group.label}</h2>
            {group.items.map(item => <button type="button" key={item.key} className={page === item.key ? 'active' : ''} aria-current={page === item.key ? 'page' : undefined} onClick={() => { onNavigate(item.key); closeMobileNav(); }}><span className="owner-nav-icon" aria-hidden="true"><OwnerNavIcon name={item.icon}/></span><span className="owner-nav-label">{item.label}</span></button>)}
          </section>)}
        </nav>
        <div className="owner-support"><SupportIcon/><span>Contact Customer Support</span></div>
      </aside>
      {mobileNavOpen && <button type="button" className="owner-mobile-backdrop" aria-label="Close navigation" onClick={closeMobileNav} />}
      <div className="owner-main">
        <div className="owner-main-inner">
        <header className="owner-topbar">
          <button type="button" className="owner-mobile-menu" aria-label="Open navigation" aria-controls="owner-primary-navigation" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(true)}><span/><span/><span/></button>
          <span className="owner-live"><i/>Live<small>System Online</small></span>
          <span className="owner-avatar">{(displayName.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('') || 'SO').toUpperCase()}</span>
          <span className="owner-account"><strong>{displayName}</strong><small>Store Owner</small></span>
          <button aria-label="Sign out" className="owner-account-caret" onClick={onSignOut}>⌄</button>
        </header>
        {children}
        </div>
      </div>
    </div>
  </div>;
}
