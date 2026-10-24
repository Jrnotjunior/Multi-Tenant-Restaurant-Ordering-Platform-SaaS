import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const files = [
  'src/styles.css',
  'src/features/storefront/storefront.css',
  'src/features/management/management.css',
] as const;

describe('Web2Table typography policy', () => {
  it('loads only Inter and Manrope as branded fonts', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('family=Inter:');
    expect(html).toContain('family=Manrope:');
    expect((html.match(/family=/g) ?? []).length).toBe(2);
  });
  it('defines Inter for interface text and Manrope for headings', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toContain('--font-body:"Inter",sans-serif');
    expect(css).toContain('--font-heading:"Manrope",sans-serif');
    expect(css).toContain('h1,h2,h3,h4,h5,h6{font-family:var(--font-heading)}');
    expect(css).toContain('button,input,select,textarea{font-family:inherit}');
  });
  it('does not introduce another named typeface into Web2Table stylesheets', () => {
    for (const path of files) {
      const css = readFileSync(path, 'utf8');
      const declarations = Array.from(css.matchAll(/font-family\s*:\s*([^;}]+)/g), m => m[1]);
      for (const family of declarations) {
        expect(family).toMatch(/^(?:var\(--font-(?:body|heading)\)|"Inter",sans-serif|"Manrope",sans-serif)$/);
      }
      expect(css).not.toMatch(/(?:Roboto|Arial|Poppins|Montserrat|Segoe UI|system-ui|BlinkMacSystemFont|-apple-system)/);
    }
  });
});
