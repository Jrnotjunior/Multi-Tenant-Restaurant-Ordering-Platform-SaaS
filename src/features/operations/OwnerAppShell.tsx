import type { ReactNode } from 'react';
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

export function OwnerAppShell({ baseUrl, groups, page, displayName, onNavigate, onSignOut, children }: Props) {
  return <div className="owner-app">
    <aside className="owner-sidebar">
      <a className="owner-brand" href={baseUrl}><span className="owner-brand-mark">W</span><span><strong>Web2Table</strong><small>RESTAURANT<br/>MANAGEMENT</small></span></a>
      {groups.map(group => <section className="owner-nav-group" key={group.label}><h2>{group.label}</h2>
        {group.items.map(item => <button type="button" key={item.key} className={page === item.key ? 'active' : ''} aria-current={page === item.key ? 'page' : undefined} onClick={() => onNavigate(item.key)}><span className="owner-nav-icon">{item.icon}</span>{item.label}</button>)}
      </section>)}
      <div className="owner-support">♧　Contact Customer Support</div>
    </aside>
    <div className="owner-main">
      <header className="owner-topbar"><span className="owner-live"><i/>Live<small>System Online</small></span><span className="owner-avatar">{(displayName.trim().split(/\s+/).slice(0,2).map(part => part[0]).join('') || 'SO').toUpperCase()}</span><span className="owner-account"><strong>{displayName}</strong><small>Store Owner</small></span><button aria-label="Sign out" className="owner-account-caret" onClick={onSignOut}>⌄</button></header>
      {children}
    </div>
  </div>;
}
