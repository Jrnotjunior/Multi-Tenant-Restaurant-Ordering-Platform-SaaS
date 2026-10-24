# W2T — Mobile-first customer storefront (demo)

## Customer experience

The root of a restaurant ordering website should be its **menu**, not the platform administration dashboard.

In the GitHub Pages preview, these routes open the customer storefront:
- / — a demonstration restaurant's menu immediately (review-friendly)
- /order — same demo restaurant menu, no login required
- /order/baryo-kitchen — example restaurant-search or shared restaurant result URL linking directly to the menu
- /order/unknown-slug — unavailable message (never render another restaurant's menu as a fallback)

Restaurant/admin workspaces are distinct protected routes and are only linked unobtrusively in the sample preview footer.

## Responsive UX

Designed mobile-first for a typical phone (320px and up):
- sticky restaurant branding, cart access and top preview disclosure
- delivery-only restaurant context
- swipeable category chips, accessible menu search and search-empty state
- single-column horizontal item cards on narrow screens
- large touch targets for add, remove and cart quantity
- persistent bottom basket CTA with item count and subtotal
- native modal dialog for mobile cart; desktop sticky basket sidebar
- 2- or 3-column product grid on wider screens
- keyboard/escape support from native dialog and reduced-motion preference

Data is **illustrative**: the fictitious restaurant Baryo Kitchen and 10 example prices/dishes are not records in Supabase. Colored emoji menu artwork is deliberately self-contained, avoiding external image hosts and showing a representative UI before real restaurant photo uploads. Never treat prices or availability as authoritative.

Basket calculations use integer centavos. Checkout is visibly disabled: there is no payment or order submission, no simulated successful transaction, no fake delivery estimate, and no customer registration requirement for browsing.

## Later backend integration

When tenant onboarding and verified menus exist, replace demo data with a public restaurant-safe published menu API:
- resolve verified custom domain or approved restaurant slug to exactly one active tenant;
- use current branch and publishing status, safe visibility and branch availability;
- retrieve only public name/photo/description/price/currency data with appropriately restricted RLS, grants or backend interface;
- validate price, modifiers, branch, stock and delivery address **again on the server at checkout**;
- never accept the sample frontend prices as payment truth;
- guest checkout remains an allowed option with secure, scoped order tracking.

No Supabase tables, payment state or older GitHub repositories were changed for this UI task.
