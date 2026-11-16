import { FlaskConical, Play, Square } from "lucide-react";
import { MAX_NEW, clampInt, type Edit, type Result } from "./api";
import { label, neuronKey } from "./format";

const branches = [
  {
    id: "baseline",
    title: "Baseline",
    placeholder: "The original continuation will appear here.",
  },
  {
    id: "modified",
    title: "Modified",
    placeholder: "See how your intervention changes the continuation.",
  },
] as const;

export function Results(props: {
  result: Result | null;
  stale: boolean;
  edits: Edit[];
  maxNew: number;
  setMaxNew: (count: number) => void;
  running: boolean;
  disabled: boolean;
  onRun: () => void;
  onStop: () => void;
}) {
  const { result } = props;
  // A result shows the edits of its run, not the current edits.
  const active = (result?.edits ?? props.edits).filter((e) => e.enabled);
  return (
    <section className="panel results">
      <div className="section-head">
        <h2>
          <FlaskConical size={18} /> The experiment
        </h2>
        <div className="run-controls">
          <label>
            New tokens{" "}
            <input
              aria-label="New tokens"
              type="number"
              min={1}
              max={MAX_NEW}
              value={props.maxNew}
              onChange={(e) =>
                props.setMaxNew(clampInt(+e.target.value, 1, MAX_NEW))
              }
            />
          </label>
          {props.running ? (
            <button className="primary" onClick={props.onStop}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button
              className="primary"
              disabled={props.disabled}
              onClick={props.onRun}
            >
              <Play size={14} /> Run comparison
            </button>
          )}
        </div>
      </div>
      <div className="result-meta">
        GREEDY DECODING · SAME STARTING PROMPT
        {props.stale && <b>Settings changed — run again</b>}
        {result?.cancelled && <b>Stopped · partial output</b>}
      </div>
      <div className="comparison">
        {branches.map(({ id, title, placeholder }) => (
          <article key={id}>
            <div className="branch-title">
              <i className={id} />
              <h3>{title}</h3>
              <span>
                {id === "baseline"
                  ? "Original model"
                  : `${active.length} active edits`}
              </span>
            </div>
            <div className="completion">
              {result ? (
                <>
                  <span>{result.prompt}</span>
                  {result[id] || <em>Waiting for output…</em>}
                </>
              ) : (
                <p className="placeholder">{placeholder}</p>
              )}
            </div>
            {id === "modified" && result && (
              <div className="run-edits">
                {active.map((e) => (
                  <span key={neuronKey(e)}>{label(e)}</span>
                ))}
              </div>
            )}
            {result?.timing?.[id] && (
              <small className="muted">{result.timing[id].toFixed(2)}s</small>
            )}
          </article>
        ))}
      </div>
      {result?.probabilities && (
        <div className="probabilities">
          <h3>Next token at the shared prompt</h3>
          <p className="hint">
            Probability shifts before the continuations diverge.
          </p>
          <div className="prob-row labels">
            <span>Token</span>
            <span>Baseline</span>
            <span>Modified</span>
            <span>Change</span>
          </div>
          {result.probabilities.map((p, i) => (
            <div className="prob-row" key={i}>
              <code>{JSON.stringify(p.token)}</code>
              <span>{(p.baseline * 100).toFixed(2)}%</span>
              <span>{(p.modified * 100).toFixed(2)}%</span>
              <span
                className={p.modified >= p.baseline ? "accent" : "negative"}
              >
                {p.modified >= p.baseline ? "+" : ""}
                {((p.modified - p.baseline) * 100).toFixed(2)} pp
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
