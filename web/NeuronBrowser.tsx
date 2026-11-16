import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Shuffle } from "lucide-react";
import {
  GRID_COLUMNS,
  LAYERS,
  NEURONS,
  clamp,
  type Analysis,
  type Summary,
} from "./api";
import { color, peak } from "./format";
import { useApi } from "./hooks";

const GRID_ROWS = NEURONS / GRID_COLUMNS;
const CELL = 10;
const LIST_LENGTH = 60;
const arrows: Record<string, number> = {
  ArrowRight: 1,
  ArrowLeft: -1,
  ArrowDown: GRID_COLUMNS,
  ArrowUp: -GRID_COLUMNS,
};

export function NeuronBrowser(props: {
  analysis: Analysis | null;
  layer: number;
  setLayer: (layer: number) => void;
  neuron: number;
  setNeuron: Dispatch<SetStateAction<number>>;
  token: number;
  setToken: (token: number) => void;
  onError: (text: string) => void;
}) {
  const { analysis, layer, neuron, setNeuron, token } = props;
  const [sort, setSort] = useState("activation");
  const canvas = useRef<HTMLCanvasElement>(null);
  // The layer summary colors the grid and ranks the list.
  // A neuron selection does not change the summary.
  const summary = useApi<Summary>(
    analysis && `/analysis/${analysis.id}/layers/${layer}?token=${token}`,
    props.onError,
  );
  const scale = useMemo(() => peak(summary?.values), [summary]);
  useEffect(() => {
    const c = canvas.current,
      ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    for (let i = 0; i < NEURONS; i++) {
      const x = (i % GRID_COLUMNS) * CELL,
        y = Math.floor(i / GRID_COLUMNS) * CELL;
      ctx.fillStyle = summary ? color(summary.values[i], scale) : "#29312e";
      ctx.fillRect(x + 1, y + 1, CELL - 3, CELL - 3);
      if (i === neuron) {
        ctx.strokeStyle = "#f0f5ed";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, CELL - 1, CELL - 1);
      }
    }
  }, [summary, neuron, scale]);
  const ranked = useMemo(() => {
    const ids = Array.from({ length: NEURONS }, (_, i) => i);
    if (summary && sort === "activation")
      ids.sort(
        (a, b) => Math.abs(summary.values[b]) - Math.abs(summary.values[a]),
      );
    return ids.slice(0, LIST_LENGTH);
  }, [summary, sort]);
  const limit = summary ? scale.toFixed(1) : "max";
  return (
    <section className="panel browser-panel">
      <div className="section-head">
        <h2>
          <span>02</span> Explore neurons
        </h2>
        <span className="muted">MLP · after GELU</span>
      </div>
      <div className="layers" aria-label="Layers">
        {Array.from({ length: LAYERS }, (_, i) => (
          <button
            className={layer === i ? "selected" : ""}
            key={i}
            onClick={() => props.setLayer(i)}
          >
            L{i}
          </button>
        ))}
      </div>
      <div className="browser-tools">
        <label>
          Color by{" "}
          <select
            aria-label="Color by token"
            value={token}
            onChange={(e) => props.setToken(+e.target.value)}
          >
            <option value={-1}>Peak activation</option>
            {analysis?.tokens.map((t, i) => (
              <option value={i} key={i}>
                {i}: {JSON.stringify(t)}
              </option>
            ))}
          </select>
        </label>
        <button
          title="Select a random neuron"
          onClick={() => setNeuron(Math.floor(Math.random() * NEURONS))}
        >
          <Shuffle size={15} />
        </button>
      </div>
      <div className="map-wrap">
        <canvas
          ref={canvas}
          width={GRID_COLUMNS * CELL}
          height={GRID_ROWS * CELL}
          tabIndex={0}
          role="grid"
          aria-label={`Layer ${layer} neuron grid. Selected neuron ${neuron}. Arrow keys move selection.`}
          onKeyDown={(e) => {
            if (e.key in arrows) {
              e.preventDefault();
              setNeuron((n) => clamp(n + arrows[e.key], 0, NEURONS - 1));
            }
          }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const cell = (offset: number, size: number, count: number) =>
              clamp(Math.floor((offset / size) * count), 0, count - 1);
            setNeuron(
              cell(e.clientY - rect.top, rect.height, GRID_ROWS) *
                GRID_COLUMNS +
                cell(e.clientX - rect.left, rect.width, GRID_COLUMNS),
            );
          }}
        />
        {!analysis && (
          <div className="map-caption">
            Analyze your text to reveal activations.
            <br />
            <small>Every dot is a neuron. Click one to explore.</small>
          </div>
        )}
      </div>
      <div className="legend">
        <span>−{limit}</span>
        <div />
        <span>0</span>
        <div />
        <span>+{limit}</span>
      </div>
      <div className="list-heading">
        <span>{summary ? "NEURONS IN YOUR TEXT" : "NEURON INDEX"}</span>
        <select
          aria-label="Sort neurons"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="activation">Strongest first</option>
          <option value="index">Index order</option>
        </select>
      </div>
      <div className="neuron-list">
        {ranked.map((n) => (
          <button
            key={n}
            className={n === neuron ? "active" : ""}
            onClick={() => setNeuron(n)}
          >
            <span>N{n}</span>
            <span className="token-label">
              {analysis && summary
                ? JSON.stringify(analysis.tokens[summary.positions[n]])
                : "—"}
            </span>
            <strong>{summary ? summary.values[n].toFixed(3) : "—"}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}
