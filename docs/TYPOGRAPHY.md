# Web2Table Typography Standard

**Approved font families: Inter and Manrope only.** This applies to the customer mobile storefront, the Restaurant Owner workspace, authentication views, and all future Web2Table features.

## Usage
- **Inter** — all body text, inputs, buttons, navigation, descriptions, prices, labels, tables and utility text.
- **Manrope** — page headings (h1–h6), product titles, section headings and prominent brand wordmarks.

## Implementation
- `src/styles.css` defines `--font-body: "Inter", sans-serif` and `--font-heading: "Manrope", sans-serif`.
- `index.html` requests **only those two families** from Google Fonts with variable-weight ranges.
- Components should use `font-family: var(--font-body)` or `font-family: var(--font-heading)` rather than introducing new font stacks.
- Inputs, buttons, selects and textareas inherit the application body font.
- `sans-serif` is a generic accessibility fallback when network fonts are unavailable; it is not an additional selected brand font.

No Roboto, Arial, Poppins, Montserrat, Segoe UI, system-ui stack, or other named typeface should be added to Web2Table components.

This typography standard is confined to **Web2Table**. The user's independent System Admin repository has not been connected or changed.
