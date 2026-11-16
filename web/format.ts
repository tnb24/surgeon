// Display helpers that the panels share.
import type { Edit } from "./api";

// Diverging scale: green for positive values, purple for negative values.
export const color = (v: number, max: number) =>
  `rgba(${v >= 0 ? "92,213,175" : "185,151,239"},${0.12 + 0.88 * Math.min(1, Math.abs(v) / max)})`;

// Largest absolute value. The minimum prevents a division by zero.
export const peak = (values: number[] | null | undefined) =>
  values?.reduce((m, v) => Math.max(m, Math.abs(v)), 0.001) ?? 0.001;

export const label = (e: Edit) =>
  `L${e.layer} / N${e.neuron} · ${e.mode}${e.mode === "ablate" ? "" : ` ${e.value}`}`;

export const neuronKey = (n: { layer: number; neuron: number }) =>
  `${n.layer}-${n.neuron}`;

// An empty token is an incomplete part of a character that spans tokens.
export const tokenText = (t: string) =>
  t === "" ? "⋯" : t.replace(/\n/g, "↵\n");
