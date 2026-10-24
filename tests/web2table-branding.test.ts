import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('Web2Table interface branding', () => {
  it('uses the Web2Table name without version suffixes', () => {
    const app = readFileSync('src/app/App.tsx', 'utf8');
    expect(app).toContain('Web2Table');
    expect(app).toContain('WEB2TABLE · SECURE WORKSPACE');
    expect(app).not.toMatch(/\bV10\b/i);
  });
});
