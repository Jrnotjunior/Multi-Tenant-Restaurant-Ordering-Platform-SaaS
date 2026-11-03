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

export function OwnerAppShell({ groups, page, displayName, onNavigate, onSignOut, children }: Props) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobileNav = () => setMobileNavOpen(false);

  return <div className={`owner-app${sidebarCollapsed ? ' owner-sidebar-collapsed' : ''}`}>
    <div className="owner-layout">
      <aside id="owner-primary-navigation" className={`owner-sidebar${mobileNavOpen ? ' is-mobile-open' : ''}`} aria-label="Primary navigation">
        <div className="owner-sidebar-heading">
          <span className="owner-sidebar-brand" aria-label="Web2table">W<span>2</span>T</span>
          <button type="button" className="owner-sidebar-collapse" aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}>{sidebarCollapsed ? '›' : '‹'}</button>
        </div>
        <nav className="owner-sidebar-nav">
          {groups.map(group => <section className="owner-nav-group" key={group.label}><h2>{group.label}</h2>
            {group.items.map(item => <button type="button" key={item.key} title={sidebarCollapsed ? item.label : undefined} className={page === item.key ? 'active' : ''} aria-current={page === item.key ? 'page' : undefined} onClick={() => { onNavigate(item.key); closeMobileNav(); }}><span className="owner-nav-icon" aria-hidden="true">{item.icon}</span><span className="owner-nav-label">{item.label}</span></button>)}
          </section>)}
        </nav>
        <div className="owner-support">♧　<span>Contact Customer Support</span></div>
      </aside>
      {mobileNavOpen && <button type="button" className="owner-mobile-backdrop" aria-label="Close navigation" onClick={closeMobileNav} />}
      <div className="owner-main">
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
  </div>;
}
