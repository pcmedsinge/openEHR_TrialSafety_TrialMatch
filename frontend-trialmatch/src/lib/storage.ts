export interface ExtractedCriteria {
  inclusion: string[];
  exclusion: string[];
  primaryFocus: string;
  queryExplanation: string;
}

export interface Protocol {
  id: string;
  name: string;
  rawText: string;
  criteria: ExtractedCriteria;
  aql: string;
  savedAt: string;
  lastMatchCount?: number;
}

const PROTOCOLS_KEY = 'tm_protocols';
const DRAFT_KEY = 'tm_draft';

export interface Draft {
  rawText: string;
  criteria: ExtractedCriteria;
  aql: string;
}

export function getDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

export function setDraft(d: Draft) {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function getProtocols(): Protocol[] {
  try {
    const raw = localStorage.getItem(PROTOCOLS_KEY);
    return raw ? (JSON.parse(raw) as Protocol[]) : [];
  } catch {
    return [];
  }
}

export function saveProtocol(p: Protocol) {
  const protocols = getProtocols().filter(x => x.id !== p.id);
  protocols.unshift(p);
  localStorage.setItem(PROTOCOLS_KEY, JSON.stringify(protocols));
}

export function deleteProtocol(id: string) {
  const protocols = getProtocols().filter(x => x.id !== id);
  localStorage.setItem(PROTOCOLS_KEY, JSON.stringify(protocols));
}

export function updateMatchCount(id: string, count: number) {
  const protocols = getProtocols().map(p =>
    p.id === id ? { ...p, lastMatchCount: count } : p
  );
  localStorage.setItem(PROTOCOLS_KEY, JSON.stringify(protocols));
}
