export function CustomerAccountLoading() {
  return <div className="sf-storefront">
    <main className="sf-unavailable" role="status" aria-live="polite">
      <span className="sf-empty-art" aria-hidden="true">👤</span>
      <h1>Loading account menu…</h1>
      <p>Checking your customer account.</p>
    </main>
  </div>;
}
