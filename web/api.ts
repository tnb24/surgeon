// Types, limits, and HTTP helpers for the Surgeon API.

export const LAYERS = 12;
export const NEURONS = 3072;
export const GRID_COLUMNS = 64;
export const MAX_EDITS = 16;
export const MAX_NEW = 256;
export const MAX_VALUE = 10000;
export const MODES = ["add", "multiply", "set", "ablate"] as const;

export type Edit = {
  layer: number;
  neuron: number;
  mode: (typeof MODES)[number];
  value: number;
  enabled: boolean;
};
export type Status = {
  state: string;
  device: string;
  error: string | null;
  model?: string;
  revision?: string;
};
export type Analysis = {
  id: string;
  tokens: string[];
  seconds: number;
  prompt: string;
};
// One value for each neuron of a layer, and the token position of that value.
export type Summary = { values: number[]; positions: number[] };
export type Probability = { token: string; baseline: number; modified: number };
export type Result = {
  prompt: string;
  edits: Edit[];
  max_new: number;
  baseline: string;
  modified: string;
  probabilities?: Probability[];
  cancelled?: boolean;
  timing?: Record<string, number>;
};
export type Experiment = {
  version: 1;
  model?: string;
  revision?: string;
  prompt: string;
  edits: Edit[];
  max_new: number;
  result: Result | null;
};
export type StreamEvent =
  | { type: "start"; prompt_tokens: number }
  | { type: "text"; branch: "baseline" | "modified"; text: string }
  | { type: "timing"; branch: "baseline" | "modified"; seconds: number }
  | { type: "probabilities"; items: Probability[] }
  | { type: "error"; message: string }
  | { type: "done"; cancelled: boolean };

export const clamp = (v: number, low: number, high: number) =>
  Math.max(low, Math.min(high, v));
export const clampInt = (v: number, low: number, high: number) =>
  clamp(Math.round(v) || 0, low, high);
export const message = (e: unknown) =>
  e instanceof Error ? e.message : String(e);
export const sameNeuron = (
  a: { layer: number; neuron: number },
  b: { layer: number; neuron: number },
) => a.layer === b.layer && a.neuron === b.neuron;

// Convert an error response to one readable message.
async function fail(r: Response): Promise<never> {
  const text = await r.text();
  let detail: unknown = text;
  try {
    detail = JSON.parse(text).detail ?? text;
  } catch {
    // The body is not JSON. Use the text.
  }
  if (Array.isArray(detail))
    detail = detail.map((d) => d?.msg ?? JSON.stringify(d)).join("; ");
  throw Error(
    typeof detail === "string" && detail
      ? detail
      : `Request failed (${r.status})`,
  );
}

function request(path: string, body?: unknown) {
  return fetch(
    "/api" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await request(path, body);
  return r.ok ? r.json() : fail(r);
}

// Read a newline-delimited JSON response one event at a time.
export async function* stream(
  path: string,
  body: unknown,
): AsyncGenerator<StreamEvent> {
  const r = await request(path, body);
  if (!r.ok) await fail(r);
  const reader = r.body!.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    pending += decoder.decode(value, { stream: true });
    let end;
    while ((end = pending.indexOf("\n")) >= 0) {
      yield JSON.parse(pending.slice(0, end));
      pending = pending.slice(end + 1);
    }
  }
}

function isEdit(e: any): e is Edit {
  return (
    !!e &&
    Number.isInteger(e.layer) &&
    e.layer >= 0 &&
    e.layer < LAYERS &&
    Number.isInteger(e.neuron) &&
    e.neuron >= 0 &&
    e.neuron < NEURONS &&
    MODES.includes(e.mode) &&
    Number.isFinite(e.value) &&
    Math.abs(e.value) <= MAX_VALUE &&
    typeof e.enabled === "boolean"
  );
}

function isEditList(edits: any): edits is Edit[] {
  return (
    Array.isArray(edits) &&
    edits.length <= MAX_EDITS &&
    edits.every(isEdit) &&
    new Set(edits.map((e) => `${e.layer}-${e.neuron}`)).size === edits.length
  );
}

const isTokenCount = (n: any) => Number.isInteger(n) && n >= 1 && n <= MAX_NEW;

// Validate a saved experiment file. Throw an Error for invalid data.
export function parseExperiment(d: any): Experiment {
  if (
    d?.version !== 1 ||
    typeof d.prompt !== "string" ||
    !isTokenCount(d.max_new)
  )
    throw Error("Invalid experiment file");
  const r = d.result;
  if (
    r &&
    (typeof r.prompt !== "string" ||
      typeof r.baseline !== "string" ||
      typeof r.modified !== "string" ||
      !isTokenCount(r.max_new) ||
      (r.probabilities &&
        (!Array.isArray(r.probabilities) ||
          r.probabilities.some(
            (p: any) =>
              !p ||
              typeof p.token !== "string" ||
              !Number.isFinite(p.baseline) ||
              !Number.isFinite(p.modified),
          ))) ||
      (r.timing && Object.values(r.timing).some((v) => !Number.isFinite(v))))
  )
    throw Error("Invalid saved result");
  if (!isEditList(d.edits) || (r && !isEditList(r.edits)))
    throw Error("Invalid neuron intervention");
  return { ...d, result: r || null };
}
