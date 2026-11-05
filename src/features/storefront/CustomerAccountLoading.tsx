export function CustomerAccountLoading() {
  return <main className="sf-account-loading" role="status" aria-live="polite">
    <section className="sf-account-loading-panel">
      <svg className="sf-account-loading-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle cx="32" cy="32" r="27" fill="#e9e0f5" stroke="#cbb8e8" strokeWidth="2"/>
        <circle cx="32" cy="24" r="10" fill="#b9a9ce"/>
        <path d="M13.5 49.5c2.7-10 9.5-15 18.5-15s15.8 5 18.5 15" fill="#b9a9ce"/>
        <path d="M22.5 21.5c1.2-5 4.7-8 9.5-8" stroke="#f8f4ff" strokeWidth="2.5" strokeLinecap="round"/>
        <path d="M16 49.5c4.2-6.5 9.5-9.5 16-9.5s11.8 3 16 9.5" stroke="#d7c4ef" strokeWidth="2" strokeLinecap="round"/>
      </svg>
      <h1>Loading account menu</h1>
      <p>Checking your customer account.</p>
    </section>
  </main>;
}
