import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Web2Table interface branding', () => {
  it('uses the Web2Table name without version suffixes', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    const ownerShell = readFileSync('src/features/operations/OwnerAppShell.tsx', 'utf8');

    expect(app).toContain('Web2Table');
    expect(ownerShell).toContain('Web2Table');
    expect(ownerShell).toContain('RESTAURANT<br/>MANAGEMENT');
    expect(app).not.toMatch(/\\bV10\\b/i);
  });

  it('renders the restaurant workspace without the legacy outer shell', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    expect(app).toContain('return <PrivilegedGate mode={view}><RestaurantWorkspace baseUrl={baseUrl} /></PrivilegedGate>;');
    expect(app).not.toContain('WEB2TABLE · SECURE WORKSPACE');
  });
});
