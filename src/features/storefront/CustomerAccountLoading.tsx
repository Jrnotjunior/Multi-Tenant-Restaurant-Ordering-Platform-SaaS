export function CustomerAccountLoading() {
  return <main className="sf-account-loading" role="status" aria-live="polite">
    <div className="sf-account-loading-content">
      <span className="sf-account-loading-icon" aria-hidden="true">🍽️</span>
      <h1>Loading account menu</h1>
      <p>Checking your customer account.</p>
    </div>
  </main>;
}
