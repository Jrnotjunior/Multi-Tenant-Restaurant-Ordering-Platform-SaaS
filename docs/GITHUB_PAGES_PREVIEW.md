# GitHub Pages visual preview

URL: https://jrnotjunior.github.io/Multi-Tenant-Restaurant-Ordering-Platform-SaaS/

Publishing source: GitHub Actions.

On every push to main, the workflow installs dependencies, checks TypeScript, runs unit tests, builds Vite with the project-site base prefix, and deploys the dist artifact.

GitHub Pages fallback uses a copy of index.html as 404.html to recover direct SPA links. GitHub Pages still returns HTTP 404 on direct deep links, so use the landing page first.

This is a visual scaffold, not a live ordering system. This preview embeds the project URL and publishable key (browser-safe values) at build time. Privileged accounts still require invitation and MFA, and checkout is not active. Only the PUBLIC Supabase URL/key may ever be passed into the browser; no secret or service-role credentials.

Future Hostinger builds require a different root base path and Auth redirect configuration.
