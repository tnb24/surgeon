# Five findings from Surgeon

Explored on 2026-10-29 using the running local app API: 36 comparisons, CPU, pinned GPT-2 small, greedy decoding, 32 generated tokens per branch. Each intervention applied at every prompt and decode position. Browser reproduction is recorded separately in `browser-verified.json`.

These are observations on the tested prompts, not established semantic labels for neurons. The selection was exploratory, not a systematic benchmark.

All seven selected cases reproduced exactly through the browser, covering all five findings, with no JavaScript errors after the prompt-switch fix. Each has a matching `.json` experiment export and `.png` screenshot in this directory. Use Import in Surgeon to open an experiment.

During exploration, switching from a shorter analyzed prompt to a longer one exposed a stale activation-detail render crash. Clearing detail when installing the new analysis fixed it in the web client. The production build passed, and `check-prompt-switch.mjs` reproduced the formerly failing sequence successfully. Before/after evidence is in `prompt-switch-before-fix.json` and `prompt-switch-check.json`.

## 1. A one-unit dose change flips the story opening

Prompt: `The city was quiet after the rain. In the distance,`

All edits below add to L6/N2130.

| Dose | P(first token = ` a`) | P(first token = ` the`) | Beginning of continuation |
|---|---:|---:|---|
| 0 | 17.9142% | 13.8143% |  a man stood in the middle of the street, his face covered with a mask. He was wearing a b |
| 5 | 16.1782% | 14.7800% |  a small group of people were gathering around a small tree.  "What's going on?"  "The cit |
| 7 | 15.5616% | 15.1378% |  a small group of people were gathering around the fire.  "What's going on?"  "The city is |
| 8 | 15.2990% | 15.3139% |  the wind was blowing.  "I'm not sure what's going on here," said the girl.  "I don't know |
| 9 | 15.0730% | 15.4889% |  the wind was blowing.  "What's going on?"  "The wind is blowing. The sky is moving. The s |
| 10 | 14.8855% | 15.6629% |  the wind was blowing.  "What's going on?"  "The wind is blowing. The sky is moving. The s |
| 20 | 14.8642% | 17.3874% |  the wind was blowing.  "What's going on?"  "What's going on? What's going on? What's goin |
| 50 | 10.7244% | 16.4751% |  the air was a little more of a wind, the air that the air of the air of the air of the ai |

Greedy decoding turns a small change in the ranking of next-token probabilities into a different continuation. This does not establish a general-purpose weather neuron. Larger doses also yield repetition.

## 2. The strongest activation can have almost no visible effect

For `1 + 1 = 2
2 + 2 = 4
3 + 3 =`, L11/N2378 peaks at about 33.54 on a newline. Ablating it leaves all 32 output tokens identical. The baseline itself incorrectly begins with ` 5`; the intervention does not fix that.

Probability of ` 5`: 39.971897% -> 39.970672%. Identical greedy text does not mean identical model probabilities.

## 3. A single edit can overwhelm output formatting in two different tasks

Adding 20 to L6/N2081 changes both arithmetic and Python-code completions into repeated newlines and fragments. On the arithmetic prompt, first-next-token newline probability changes as follows:

0.013665% -> 99.964666%.

This is evidence of a large effect on these two prompts, not proof of an exclusive formatting role.

## 4. The same edit collapses opposite sentiment prompts to identical text

Positive prompt: `The movie was wonderful. The acting was brilliant and the story was`

Negative prompt: `The movie was terrible. The acting was awful and the story was`

Their baselines start ` great` and ` terrible`. Adding 20 to L6/N2374 makes both complete with exactly the same 32-token sequence:

```text
 the story the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the
```

This is a loss of sensitivity to the prompt in these examples, rather than successful sentiment control.

## 5. An edit pushes French output toward German-looking fragments

Prompt: `Le soleil brille dans le ciel. Les oiseaux chantent et`

Adding 20 to L6/N795 changes French-looking continuation into ` die nach dem dem ...`. The output is repetitive and mixed, not fluent German. Smaller doses and an English prompt were also tested; see the full log below.

## Full experiment log

### city-dose-0

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 0, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```

### city-dose-5

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 5, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 a small group of people were gathering around a small tree.

"What's going on?"

"The city is getting a little bit colder.
```

### city-dose-10

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 10, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 the wind was blowing.

"What's going on?"

"The wind is blowing. The sky is moving. The sky is moving. The
```

### city-dose-20

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 the wind was blowing.

"What's going on?"

"What's going on? What's going on? What's going on? What
```

### city-dose--20

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": -20, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 a young man was sitting on a bench in the back of the bench, and he was given a small piece of a small piece of a small piece of a
```

### city-dose-50

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 50, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 the air was a little more of a wind, the air that the air of the air of the air of the air of the air of the air of the
```

### fact-L6-ablate

Edit: `[{"layer": 6, "neuron": 1988, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
The capital of France is
```
**Baseline**
```text
 the capital of the French Republic, and the capital of the French Republic is the capital of the French Republic.

The French Republic is the capital of the
```
**Modified**
```text
 the capital of the French Republic. The capital of France is the capital of the French Republic.

The capital of France is the capital of the French Republic
```

### fact-L6-add

Edit: `[{"layer": 6, "neuron": 1988, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The capital of France is
```
**Baseline**
```text
 the capital of the French Republic, and the capital of the French Republic is the capital of the French Republic.

The French Republic is the capital of the
```
**Modified**
```text
 the French Empire, and its people have been the most prosperous and prosperous people in the world. The British Empire was the first to be independent, and the British
```

### fact-L11-ablate

Edit: `[{"layer": 11, "neuron": 2910, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
The capital of France is
```
**Baseline**
```text
 the capital of the French Republic, and the capital of the French Republic is the capital of the French Republic.

The French Republic is the capital of the
```
**Modified**
```text
 the capital of the French Republic, and the capital of the Republic of Luxembourg. The capital of the Republic of Luxembourg is the capital of the Republic of France.
```

### fact-L11-add

Edit: `[{"layer": 11, "neuron": 2910, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The capital of France is
```
**Baseline**
```text
 the capital of the French Republic, and the capital of the French Republic is the capital of the French Republic.

The French Republic is the capital of the
```
**Modified**
```text
 the capital of the French Republic.

The French Republic is a state of the art, with a population of over 1.5 million.

The
```

### arithmetic-L6-ablate

Edit: `[{"layer": 6, "neuron": 2081, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
1 + 1 = 2
2 + 2 = 4
3 + 3 =
```
**Baseline**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```
**Modified**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```

### arithmetic-L6-add

Edit: `[{"layer": 6, "neuron": 2081, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
1 + 1 = 2
2 + 2 = 4
3 + 3 =
```
**Baseline**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```
**Modified**
```text


"


"

"

"

"

"

"

"

"

"

```

### arithmetic-L11-ablate

Edit: `[{"layer": 11, "neuron": 2378, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
1 + 1 = 2
2 + 2 = 4
3 + 3 =
```
**Baseline**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```
**Modified**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```

### arithmetic-L11-add

Edit: `[{"layer": 11, "neuron": 2378, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
1 + 1 = 2
2 + 2 = 4
3 + 3 =
```
**Baseline**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```
**Modified**
```text
 5
6 + 4 = 6
7 + 5 = 7
8 + 6 = 8
9 + 7 = 9
10 + 8 = 10

```

### code-L6-ablate

Edit: `[{"layer": 6, "neuron": 2081, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
def fibonacci(n):
    if n <= 1:
        return n
    return
```
**Baseline**
```text
 fibonacci(n)

return fibonacci(n)

def fibonacci(n):

return fibonacci(n
```
**Modified**
```text
 fibonacci(n)

return fibonacci(n)

def fibonacci(n):

return fibonacci(n
```

### code-L6-add

Edit: `[{"layer": 6, "neuron": 2081, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
def fibonacci(n):
    if n <= 1:
        return n
    return
```
**Baseline**
```text
 fibonacci(n)

return fibonacci(n)

def fibonacci(n):

return fibonacci(n
```
**Modified**
```text


The


The


The



The


The


The


The


The
```

### code-L11-ablate

Edit: `[{"layer": 11, "neuron": 2378, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
def fibonacci(n):
    if n <= 1:
        return n
    return
```
**Baseline**
```text
 fibonacci(n)

return fibonacci(n)

def fibonacci(n):

return fibonacci(n
```
**Modified**
```text
 fibonacci(n)

return fibonacci(n)

def fibonacci(n):

return fibonacci(n
```

### code-L11-add

Edit: `[{"layer": 11, "neuron": 2378, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
def fibonacci(n):
    if n <= 1:
        return n
    return
```
**Baseline**
```text
 fibonacci(n)

return fibonacci(n)

def fibonacci(n):

return fibonacci(n
```
**Modified**
```text
 n

return fibonacci(n, 1)

def fibonacci(n):

return fibonacci(n, 1)
```

### positive-L6-ablate

Edit: `[{"layer": 6, "neuron": 2374, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
The movie was wonderful. The acting was brilliant and the story was
```
**Baseline**
```text
 great. I was really impressed with the way the characters were portrayed. I think it was a great movie. I think it was a great movie. I think
```
**Modified**
```text
 great. I was really impressed with the way the characters were portrayed. I think it was a great movie. I think it was a great movie. I think
```

### positive-L6-add

Edit: `[{"layer": 6, "neuron": 2374, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The movie was wonderful. The acting was brilliant and the story was
```
**Baseline**
```text
 great. I was really impressed with the way the characters were portrayed. I think it was a great movie. I think it was a great movie. I think
```
**Modified**
```text
 the story the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the
```

### positive-L11-ablate

Edit: `[{"layer": 11, "neuron": 611, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
The movie was wonderful. The acting was brilliant and the story was
```
**Baseline**
```text
 great. I was really impressed with the way the characters were portrayed. I think it was a great movie. I think it was a great movie. I think
```
**Modified**
```text
 great. I loved the characters and the story was great. I loved the characters and the story was great. I loved the characters and the story was great.
```

### positive-L11-add

Edit: `[{"layer": 11, "neuron": 611, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The movie was wonderful. The acting was brilliant and the story was
```
**Baseline**
```text
 great. I was really impressed with the way the characters were portrayed. I think it was a great movie. I think it was a great movie. I think
```
**Modified**
```text
 great. The characters were great. The music was great. The music was great. The characters were great. The music was great. The characters were great.
```

### negative-L6-ablate

Edit: `[{"layer": 6, "neuron": 2374, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
The movie was terrible. The acting was awful and the story was
```
**Baseline**
```text
 terrible. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed.
```
**Modified**
```text
 terrible. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed.
```

### negative-L6-add

Edit: `[{"layer": 6, "neuron": 2374, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The movie was terrible. The acting was awful and the story was
```
**Baseline**
```text
 terrible. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed.
```
**Modified**
```text
 the story the the the the the the the the the the the the the the the the the the the the the the the the the the the the the the
```

### negative-L11-ablate

Edit: `[{"layer": 11, "neuron": 611, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
The movie was terrible. The acting was awful and the story was
```
**Baseline**
```text
 terrible. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed.
```
**Modified**
```text
 terrible. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed.
```

### negative-L11-add

Edit: `[{"layer": 11, "neuron": 611, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The movie was terrible. The acting was awful and the story was
```
**Baseline**
```text
 terrible. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed.
```
**Modified**
```text
 so bad. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed. I was so disappointed
```

### french-L6-ablate

Edit: `[{"layer": 6, "neuron": 795, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
Le soleil brille dans le ciel. Les oiseaux chantent et
```
**Baseline**
```text
 les cieles de l'école de l'école de l'école de l'école de l'é
```
**Modified**
```text
 les oiseaux chantent les oiseaux chantent les oiseaux chantent les oiseaux chantent les oiseaux chantent les o
```

### french-L6-add

Edit: `[{"layer": 6, "neuron": 795, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
Le soleil brille dans le ciel. Les oiseaux chantent et
```
**Baseline**
```text
 les cieles de l'école de l'école de l'école de l'école de l'é
```
**Modified**
```text
 die nach dem dem dem dem dem dem dem dem entre parten.

Unter die die die nach dem dem dem dem dem dem ent
```

### french-L11-ablate

Edit: `[{"layer": 11, "neuron": 2910, "mode": "ablate", "value": 0, "enabled": true}]`

**Prompt**
```text
Le soleil brille dans le ciel. Les oiseaux chantent et
```
**Baseline**
```text
 les cieles de l'école de l'école de l'école de l'école de l'é
```
**Modified**
```text
 les cieles de la ciel.

Le ciel de la ciel.

Le ciel de la ciel.

Le
```

### french-L11-add

Edit: `[{"layer": 11, "neuron": 2910, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
Le soleil brille dans le ciel. Les oiseaux chantent et
```
**Baseline**
```text
 les cieles de l'école de l'école de l'école de l'école de l'é
```
**Modified**
```text
 le ciel.

Le ciel dans le ciel.

Le ciel dans le ciel.

Le ciel d
```

### city-dose-7

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 7, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 a small group of people were gathering around the fire.

"What's going on?"

"The city is getting colder. The wind is blowing
```

### city-dose-8

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 8, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 the wind was blowing.

"I'm not sure what's going on here," said the girl.

"I don't know what's going
```

### city-dose-9

Edit: `[{"layer": 6, "neuron": 2130, "mode": "add", "value": 9, "enabled": true}]`

**Prompt**
```text
The city was quiet after the rain. In the distance,
```
**Baseline**
```text
 a man stood in the middle of the street, his face covered with a mask. He was wearing a black hooded sweatshirt and a black jacket. He
```
**Modified**
```text
 the wind was blowing.

"What's going on?"

"The wind is blowing. The sky is moving. The sky is moving. The
```

### french-dose-5

Edit: `[{"layer": 6, "neuron": 795, "mode": "add", "value": 5, "enabled": true}]`

**Prompt**
```text
Le soleil brille dans le ciel. Les oiseaux chantent et
```
**Baseline**
```text
 les cieles de l'école de l'école de l'école de l'école de l'é
```
**Modified**
```text
 leur précis.

Le ciel, le ciel, le ciel, le ciel, le ciel, le ciel
```

### french-dose-10

Edit: `[{"layer": 6, "neuron": 795, "mode": "add", "value": 10, "enabled": true}]`

**Prompt**
```text
Le soleil brille dans le ciel. Les oiseaux chantent et
```
**Baseline**
```text
 les cieles de l'école de l'école de l'école de l'école de l'é
```
**Modified**
```text
 leur für die eine eine eine eine eine eine eine eine eine eine eine eine eine e
```

### english-weather-L6-N795

Edit: `[{"layer": 6, "neuron": 795, "mode": "add", "value": 20, "enabled": true}]`

**Prompt**
```text
The sun is shining in the sky. The birds are singing and
```
**Baseline**
```text
 the birds are singing. The birds are singing and the birds are singing. The birds are singing and the birds are singing. The birds are singing and the birds
```
**Modified**
```text
 in the kreis, kon kreis, kon kreis, kon kreis, ken kreis.


```
