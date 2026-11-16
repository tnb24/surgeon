import { useEffect, useRef, useState } from "react";
import { Activity, Download, Upload, X } from "lucide-react";
import {
  api,
  message,
  parseExperiment,
  stream,
  type Analysis,
  type Edit,
  type Experiment,
  type Result,
  type Status,
} from "./api";
import { Inspector } from "./Inspector";
import { NeuronBrowser } from "./NeuronBrowser";
import { PromptPanel, initialPrompt } from "./PromptPanel";
import { Results } from "./Results";

const POLL_MS = 2000;
const offline: Status = {
  state: "offline",
  device: "",
  error: "Start the local server to connect to GPT-2.",
};

// The App owns the experiment: prompt, selection, edits, and result.
// Each panel owns the state that only that panel uses.
export default function App() {
  const [status, setStatus] = useState<Status>({
    state: "connecting",
    device: "",
    error: null,
  });
  const [prompt, setPrompt] = useState(initialPrompt);
  const [layer, setLayer] = useState(6);
  const [neuron, setNeuron] = useState(123);
  const [token, setToken] = useState(-1);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [maxNew, setMaxNew] = useState(48);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"" | "Analyzing" | "Generating">("");
  const [error, setError] = useState("");
  const run = useRef("");
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    const poll = () =>
      api<Status>("/status")
        .then((s) => live && setStatus(s))
        .catch(() => live && setStatus(offline));
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);

  const ready = status.state === "ready";
  const blocked = !!busy || !ready || !prompt.trim();
  const stale =
    !!result &&
    JSON.stringify([result.prompt, result.edits, result.max_new]) !==
      JSON.stringify([prompt, edits, maxNew]);

  function select(nextLayer: number, nextNeuron: number) {
    setLayer(nextLayer);
    setNeuron(nextNeuron);
  }
  async function analyze() {
    setError("");
    setBusy("Analyzing");
    const text = prompt;
    try {
      const a = await api<Omit<Analysis, "prompt">>("/analyze", {
        prompt: text,
      });
      setToken(-1);
      setAnalysis({ ...a, prompt: text });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy("");
    }
  }
  async function generate() {
    setBusy("Generating");
    setError("");
    const update = (change: (old: Result) => Partial<Result>) =>
      setResult((old) => (old ? { ...old, ...change(old) } : old));
    setResult({
      prompt,
      edits: structuredClone(edits),
      max_new: maxNew,
      baseline: "",
      modified: "",
    });
    run.current = crypto.randomUUID();
    try {
      let finished = false;
      const events = stream("/generate", {
        prompt,
        edits,
        max_new: maxNew,
        run_id: run.current,
      });
      for await (const event of events) {
        if (event.type === "error") throw Error(event.message);
        if (event.type === "text")
          update(() => ({ [event.branch]: event.text }));
        if (event.type === "probabilities")
          update(() => ({ probabilities: event.items }));
        if (event.type === "timing")
          update((old) => ({
            timing: { ...old.timing, [event.branch]: event.seconds },
          }));
        if (event.type === "done") {
          finished = true;
          update(() => ({ cancelled: event.cancelled }));
        }
      }
      if (!finished) throw Error("The server closed the connection.");
    } catch (e) {
      update(() => ({ cancelled: true }));
      setError(message(e));
    } finally {
      setBusy("");
      run.current = "";
    }
  }
  function stop() {
    api("/stop/" + run.current, {}).catch((e) => setError(message(e)));
  }
  function save() {
    const experiment: Experiment = {
      version: 1,
      model: status.model,
      revision: status.revision,
      prompt,
      edits,
      max_new: maxNew,
      result,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(experiment, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "surgeon-experiment.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  async function load(f: File) {
    if (busy) return;
    try {
      const d = parseExperiment(JSON.parse(await f.text()));
      setPrompt(d.prompt);
      setEdits(d.edits);
      setMaxNew(d.max_new);
      setResult(d.result);
      setAnalysis(null);
      setToken(-1);
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  return (
    <>
      <header>
        <a className="brand" href="/">
          <Activity size={23} />
          <b>surgeon</b>
          <span>NEURON PLAYGROUND</span>
        </a>
        <div className="header-actions">
          <span className={"status " + (ready ? "ready" : "")}>
            <i />
            {ready
              ? `GPT-2 small · ${status.device.toUpperCase()}`
              : status.state}
          </span>
          <button
            disabled={!!busy}
            onClick={() => file.current?.click()}
            title="Import experiment"
          >
            <Upload size={16} />
            <span>Import</span>
          </button>
          <button onClick={save}>
            <Download size={16} />
            <span>Save experiment</span>
          </button>
          <input
            ref={file}
            hidden
            type="file"
            accept=".json"
            onChange={async (e) => {
              const input = e.currentTarget;
              if (input.files?.[0]) await load(input.files[0]);
              input.value = "";
            }}
          />
        </div>
      </header>
      <main>
        <div className="intro">
          <div>
            <span className="eyebrow">OPEN THE BLACK BOX</span>
            <h1>A small change. A different thought.</h1>
            <p>
              Find a neuron, change its activation, and see what GPT-2 writes.
            </p>
          </div>
          <span className="model-tag">
            12 layers <span>×</span> 3,072 neurons
          </span>
        </div>
        {(error || status.error) && (
          <div role="alert" className="error">
            {error || status.error}
            <button aria-label="Dismiss error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <div className="workspace">
          <PromptPanel
            prompt={prompt}
            setPrompt={setPrompt}
            analysis={analysis}
            analyzing={busy === "Analyzing"}
            disabled={blocked}
            onAnalyze={analyze}
          />
          <NeuronBrowser
            analysis={analysis}
            layer={layer}
            setLayer={setLayer}
            neuron={neuron}
            setNeuron={setNeuron}
            token={token}
            setToken={setToken}
            onError={setError}
          />
          <Inspector
            analysis={analysis}
            layer={layer}
            neuron={neuron}
            select={select}
            token={token}
            setToken={setToken}
            edits={edits}
            setEdits={setEdits}
            onError={setError}
          />
          <Results
            result={result}
            stale={stale}
            edits={edits}
            maxNew={maxNew}
            setMaxNew={setMaxNew}
            running={busy === "Generating"}
            disabled={blocked}
            onRun={generate}
            onStop={stop}
          />
        </div>
        <footer>
          <span>SURGEON / GPT-2 SMALL</span>
          <span>Explore a response. Test a hypothesis.</span>
          <span>Local inference · 124M parameters</span>
        </footer>
      </main>
    </>
  );
}
