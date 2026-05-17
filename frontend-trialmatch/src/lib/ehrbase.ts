const BASE = import.meta.env.VITE_EHRBASE_URL as string;
const AUTH = 'Basic ' + btoa(
  `${import.meta.env.VITE_EHRBASE_USER}:${import.meta.env.VITE_EHRBASE_PASS}`
);

export interface AqlResult {
  rows: unknown[][];
  columns: { name: string; path: string }[];
  resultsize: number;
}

export async function runAql(q: string, params?: Record<string, unknown>): Promise<AqlResult> {
  const res = await fetch(`${BASE}/openehr/v1/query/aql`, {
    method: 'POST',
    headers: { Authorization: AUTH, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(params ? { q, query_parameters: params } : { q }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AQL error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}
