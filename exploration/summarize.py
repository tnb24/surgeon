import json
from pathlib import Path

root=Path(__file__).resolve().parent
runs=[json.loads(line) for line in (root/'runs.jsonl').read_text(encoding='utf8').splitlines()]
by_name={r['name']:r for r in runs}
names=['city-dose-8','arithmetic-L11-ablate','arithmetic-L6-add','code-L6-add','positive-L6-add','negative-L6-add','french-L6-add']
finalists=[by_name[n] for n in names]
(root/'finalists.json').write_text(json.dumps(finalists,indent=2),encoding='utf8')
for r in runs:
    experiment=dict(version=1,model='openai-community/gpt2',revision='607a30d783dfa663caf39e06633721c8d4cfcd7e',prompt=r['prompt'],edits=r['edits'],max_new=r['max_new'],result={k:v for k,v in r.items() if k!='name'})
    (root/(r['name']+'.json')).write_text(json.dumps(experiment,indent=2),encoding='utf8')

report=['# Five findings from Surgeon','',f'Explored on 2026-10-29 using the running local app API: {len(runs)} comparisons, CPU, pinned GPT-2 small, greedy decoding, 32 generated tokens per branch. Each intervention applied at every prompt and decode position. Browser reproduction is recorded separately in `browser-verified.json`.','',
'These are observations on the tested prompts, not established semantic labels for neurons. The selection was exploratory, not a systematic benchmark.','',
'## 1. A one-unit dose change flips the story opening','',
'Prompt: `The city was quiet after the rain. In the distance,`','',
'All edits below add to L6/N2130.','',
'| Dose | P(first token = ` a`) | P(first token = ` the`) | Beginning of continuation |','|---|---:|---:|---|']
for dose in (0,5,7,8,9,10,20,50):
    r=by_name[f'city-dose-{dose}']; p={x['token']:x['modified'] for x in r['probabilities']}
    report.append(f'| {dose} | {p.get(" a",0)*100:.4f}% | {p.get(" the",0)*100:.4f}% | {r["modified"][:90].replace(chr(10)," ")} |')
report += ['', 'Greedy decoding turns a small change in the ranking of next-token probabilities into a different continuation. This does not establish a general-purpose weather neuron. Larger doses also yield repetition.', '',
'## 2. The strongest activation can have almost no visible effect','',
'For `1 + 1 = 2\n2 + 2 = 4\n3 + 3 =`, L11/N2378 peaks at about 33.54 on a newline. Ablating it leaves all 32 output tokens identical. The baseline itself incorrectly begins with ` 5`; the intervention does not fix that.', '']
r=by_name['arithmetic-L11-ablate']
for p in r['probabilities']:
    if p['token']==' 5': report += [f'Probability of ` 5`: {p["baseline"]*100:.6f}% -> {p["modified"]*100:.6f}%. Identical greedy text does not mean identical model probabilities.','']
report += ['## 3. A single edit can overwhelm output formatting in two different tasks','',
'Adding 20 to L6/N2081 changes both arithmetic and Python-code completions into repeated newlines and fragments. On the arithmetic prompt, first-next-token newline probability changes as follows:','']
for p in by_name['arithmetic-L6-add']['probabilities']:
    if p['token']=='\n': report += [f'{p["baseline"]*100:.6f}% -> {p["modified"]*100:.6f}%.','']
report += ['This is evidence of a large effect on these two prompts, not proof of an exclusive formatting role.','',
'## 4. The same edit collapses opposite sentiment prompts to identical text','',
'Positive prompt: `The movie was wonderful. The acting was brilliant and the story was`','',
'Negative prompt: `The movie was terrible. The acting was awful and the story was`','',
'Their baselines start ` great` and ` terrible`. Adding 20 to L6/N2374 makes both complete with exactly the same 32-token sequence:','',
'```text',by_name['positive-L6-add']['modified'],'```','',
'This is a loss of sensitivity to the prompt in these examples, rather than successful sentiment control.','',
'## 5. An edit pushes French output toward German-looking fragments','',
'Prompt: `Le soleil brille dans le ciel. Les oiseaux chantent et`','',
'Adding 20 to L6/N795 changes French-looking continuation into ` die nach dem dem ...`. The output is repetitive and mixed, not fluent German. Smaller doses and an English prompt were also tested; see the full log below.','',
'## Full experiment log','']
for r in runs:
    report += [f'### {r["name"]}','',f'Edit: `{json.dumps(r["edits"])}`','', '**Prompt**','```text',r['prompt'],'```','**Baseline**','```text',r['baseline'],'```','**Modified**','```text',r['modified'],'```','']
(root/'FINDINGS.md').write_text('\n'.join(report),encoding='utf8')
print(json.dumps(dict(comparisons=len(runs),browser_cases=names)))
