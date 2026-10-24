import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('System Admin custom-domain routing', () => {
  it('links to the separate administrator application', () => {
    const app=readFileSync('src/app/App.tsx','utf8');
    expect(app).toContain('https://admin.web2table.io/');
    expect(app).not.toContain('https://jrnotjunior.github.io/web2table-system-admin/');
  });
});
