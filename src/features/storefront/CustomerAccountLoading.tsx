export function CustomerAccountLoading() {
  return <main className="sf-account-loading" role="status" aria-live="polite">
    <section className="sf-account-loading-panel">
      <svg className="sf-account-loading-icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M9 5v12M14 5v12M19 5v12M9 17c0 4 2 6 5 7v34" stroke="#aaa1bd" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M45 7c-5 0-8 5-8 14v8c0 5 2 8 5 9v20h6V7h-3Z" fill="#aaa1bd"/>
        <circle cx="32" cy="31" r="20" fill="#e5d9f6" stroke="#cbb8e8" strokeWidth="2"/>
        <circle cx="32" cy="31" r="14" fill="#d7c4ef"/>
        <path d="M21 22c3-4 7-6 11-6" stroke="#f7f1ff" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      <h1>Loading account menu</h1>
      <p>Checking your customer account.</p>
    </section>
  </main>;
}
