import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Web2Table interface branding', () => {
  it('uses the Web2Table name without version suffixes', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    const ownerShell = readFileSync('src/features/operations/OwnerAppShell.tsx', 'utf8');

    expect(app).toContain('Web2Table');
    // Workspace branding was intentionally removed; keep the product name in
    // the application while ensuring the owner workspace has no legacy brand header.
    expect(ownerShell).not.toContain('owner-brand');
    expect(ownerShell).not.toContain('RESTAURANT<br/>MANAGEMENT');
    expect(app).not.toMatch(/\\bV10\\b/i);
  });

  it('renders the restaurant workspace without the legacy outer shell', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    expect(app).toContain('return <PrivilegedGate mode={view}><RestaurantWorkspace baseUrl={baseUrl} /></PrivilegedGate>;');
    expect(app).not.toContain('WEB2TABLE · SECURE WORKSPACE');
  });
});
