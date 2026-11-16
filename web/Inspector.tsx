import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ArrowRight, Bookmark, RotateCcw, X } from "lucide-react";
import {
  MAX_EDITS,
  MAX_VALUE,
  MODES,
  NEURONS,
  clamp,
  clampInt,
  sameNeuron,
  type Analysis,
  type Edit,
} from "./api";
import { color, label, neuronKey, peak, tokenText } from "./format";
import { useApi, useStored } from "./hooks";

const defaults: Record<Edit["mode"], number> = {
  add: 5,
  multiply: 2,
  set: 5,
  ablate: 0,
};
const valueLabels: Record<Edit["mode"], string> = {
  add: "Activation value",
  multiply: "Multiplier",
  set: "Activation value",
  ablate: "Set activation to zero",
};

export function Inspector(props: {
  analysis: Analysis | null;
  layer: number;
  neuron: number;
  select: (layer: number, neuron: number) => void;
  token: number;
  setToken: (token: number) => void;
  edits: Edit[];
  setEdits: Dispatch<SetStateAction<Edit[]>>;
  onError: (text: string) => void;
}) {
  const { analysis, layer, neuron, select, token, edits, setEdits } = props;
  const [mode, setMode] = useState<Edit["mode"]>("add");
  const [value, setValue] = useState(defaults.add);
  const [bookmarks, setBookmarks] = useStored<
    { layer: number; neuron: number }[]
  >("surgeon-bookmarks", []);
  const current = { layer, neuron };
  const loaded = useApi<{ trace: number[] }>(
    analysis && `/analysis/${analysis.id}/layers/${layer}/neurons/${neuron}`,
    props.onError,
  );
  const trace = loaded?.trace;
  const traceScale = useMemo(() => peak(trace), [trace]);

  function addEdit() {
    const edit = { ...current, mode, value, enabled: true };
    if (edits.length >= MAX_EDITS && !edits.some((e) => sameNeuron(e, edit))) {
      props.onError(
        `An experiment holds a maximum of ${MAX_EDITS} interventions.`,
      );
      return;
    }
    // A second edit of the same neuron replaces the first edit.
    setEdits((old) => [...old.filter((e) => !sameNeuron(e, edit)), edit]);
  }
  function toggleBookmark() {
    setBookmarks((old) =>
      old.some((b) => sameNeuron(b, current))
        ? old.filter((b) => !sameNeuron(b, current))
        : [...old, current],
    );
  }
  return (
    <section className="panel inspector">
      <div className="section-head">
        <h2>
          <span>03</span> Make an intervention
        </h2>
        <button
          aria-label="Bookmark neuron"
          className={
            bookmarks.some((b) => sameNeuron(b, current)) ? "accent" : ""
          }
          onClick={toggleBookmark}
        >
          <Bookmark size={17} />
        </button>
      </div>
      <div className="neuron-title">
        <span>L{layer}</span>
        <span>/</span>
        <label>
          N
          <input
            aria-label="Neuron ID"
            type="number"
            min={0}
            max={NEURONS - 1}
            value={neuron}
            onChange={(e) =>
              select(layer, clampInt(+e.target.value, 0, NEURONS - 1))
            }
          />
        </label>
      </div>
      <div className="eyebrow">
        ACTIVATION OVER YOUR TEXT <span>UNMODIFIED</span>
      </div>
      <div className="token-trace">
        {analysis && trace?.length === analysis.tokens.length ? (
          analysis.tokens.map((t, i) => (
            <button
              key={i}
              title={`Token ${i}: ${trace[i].toFixed(4)}`}
              style={{ background: color(trace[i], traceScale) }}
              onClick={() => props.setToken(token === i ? -1 : i)}
              className={token === i ? "token-selected" : ""}
            >
              {tokenText(t)}
            </button>
          ))
        ) : (
          <p>
            {analysis
              ? "Loading activations…"
              : "Analyze a prompt to see when this neuron responds."}
          </p>
        )}
      </div>
      <div className="modes">
        {MODES.map((m) => (
          <button
            key={m}
            className={m === mode ? "selected" : ""}
            onClick={() => {
              setMode(m);
              setValue(defaults[m]);
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <div className="value-row">
        <label>{valueLabels[mode]}</label>
        <input
          aria-label="Intervention value"
          type="number"
          step="0.1"
          min={-MAX_VALUE}
          max={MAX_VALUE}
          disabled={mode === "ablate"}
          value={value}
          onChange={(e) =>
            setValue(clamp(+e.target.value || 0, -MAX_VALUE, MAX_VALUE))
          }
        />
      </div>
      <input
        aria-label="Activation slider"
        className="slider"
        type="range"
        min={Math.min(-20, value)}
        max={Math.max(20, value)}
        step=".1"
        disabled={mode === "ablate"}
        value={value}
        onChange={(e) => setValue(+e.target.value)}
      />
      <p className="hint">
        Applies to every prompt and generated token. Values are in raw
        activation units.
      </p>
      <button className="add-button" onClick={addEdit}>
        Apply to experiment <ArrowRight size={16} />
      </button>
      <div className="section-head edits-head">
        <h3>
          Interventions <span>{edits.length}</span>
        </h3>
        <button onClick={() => setEdits([])} title="Reset all interventions">
          <RotateCcw size={14} /> Reset
        </button>
      </div>
      <div className="edits">
        {edits.length ? (
          edits.map((e) => (
            <div key={neuronKey(e)}>
              <input
                aria-label={`Enable ${label(e)}`}
                type="checkbox"
                checked={e.enabled}
                onChange={() =>
                  setEdits((old) =>
                    old.map((x) =>
                      x === e ? { ...x, enabled: !x.enabled } : x,
                    ),
                  )
                }
              />
              <button
                onClick={() => {
                  select(e.layer, e.neuron);
                  setMode(e.mode);
                  setValue(e.value);
                }}
              >
                {label(e)}
              </button>
              <button
                aria-label={`Remove ${label(e)}`}
                onClick={() => setEdits((old) => old.filter((x) => x !== e))}
              >
                <X size={13} />
              </button>
            </div>
          ))
        ) : (
          <p className="hint">Add a neuron above to change the modified run.</p>
        )}
      </div>
      {bookmarks.length > 0 && (
        <div className="bookmarks">
          <span>BOOKMARKS</span>
          {bookmarks.map((b) => (
            <button
              key={neuronKey(b)}
              onClick={() => select(b.layer, b.neuron)}
            >
              L{b.layer}/N{b.neuron}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
