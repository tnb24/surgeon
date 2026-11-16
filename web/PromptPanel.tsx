import { Activity } from "lucide-react";
import type { Analysis } from "./api";

export const initialPrompt =
  "The city was quiet after the rain. In the distance,";
const examples = [
  ["Story", initialPrompt],
  ["Code", "def fibonacci(n):\n    "],
  ["Science", "The most interesting thing about the ocean is"],
];

export function PromptPanel(props: {
  prompt: string;
  setPrompt: (text: string) => void;
  analysis: Analysis | null;
  analyzing: boolean;
  disabled: boolean;
  onAnalyze: () => void;
}) {
  const { prompt, setPrompt, analysis } = props;
  return (
    <section className="panel prompt-panel">
      <div className="section-head">
        <h2>
          <span>01</span> Give it a thought
        </h2>
        <span className="muted">Plain text completion</span>
      </div>
      <textarea
        aria-label="Prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        spellCheck={false}
      />
      <div className="prompt-bottom">
        <div className="examples">
          <span>TRY</span>
          {examples.map(([name, text]) => (
            <button key={name} onClick={() => setPrompt(text)}>
              {name}
            </button>
          ))}
        </div>
        <button
          className="primary"
          onClick={props.onAnalyze}
          disabled={props.disabled}
        >
          <Activity size={15} />
          {props.analyzing ? "Analyzing…" : "Analyze text"}
        </button>
      </div>
      {analysis && (
        <div className="analysis-note">
          {analysis.tokens.length} tokens · {analysis.seconds.toFixed(2)}s
          {analysis.prompt !== prompt
            ? " · Prompt changed — analyze again"
            : ""}
        </div>
      )}
    </section>
  );
}
