/** Monetary values stay in integer centavos, never JS floating-point order totals. */
export function pesoInputToCentavos(input: string): number | null {
  const normalized = input.trim();
  if (!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(normalized)) return null;
  const [pesos, cents = ''] = normalized.split('.');
  const amount = Number(pesos) * 100 + Number(cents.padEnd(2, '0'));
  return Number.isSafeInteger(amount) && amount <= 100_000_000 ? amount : null;
}
export function centavosToPesoInput(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('Invalid price');
  return (centavos / 100).toFixed(2);
}
