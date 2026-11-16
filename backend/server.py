"""HTTP API for the runtime. The server also serves the built frontend."""
import asyncio
import json
import threading
from contextlib import asynccontextmanager
from pathlib import Path as FilePath
from typing import Literal

from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from .runtime import CONTEXT, LAYERS, MODEL, NEURONS, REVISION, Busy, Runtime

runtime = Runtime()
jobs = {}  # Run ID -> cancel event of the active run.


@asynccontextmanager
async def lifespan(app):
    threading.Thread(target=runtime.load, daemon=True).start()
    yield


app = FastAPI(title='Surgeon', lifespan=lifespan)


class Edit(BaseModel):
    layer: int = Field(ge=0, lt=LAYERS)
    neuron: int = Field(ge=0, lt=NEURONS)
    mode: Literal['add', 'multiply', 'set', 'ablate']
    value: float = Field(allow_inf_nan=False, ge=-10000, le=10000)
    enabled: bool = True


class Prompt(BaseModel):
    prompt: str = Field(min_length=1, max_length=100000)


class Experiment(Prompt):
    edits: list[Edit] = Field(default_factory=list, max_length=16)
    max_new: int = Field(default=48, ge=1, le=256)
    run_id: str = Field(pattern=r'^[a-zA-Z0-9-]{1,64}$')

    @model_validator(mode='after')
    def unique(self):
        keys = [(e.layer, e.neuron) for e in self.edits]
        if len(keys) != len(set(keys)):
            raise ValueError('Use one operation per neuron')
        return self


def respond(action, *args):
    """Call the runtime and map each runtime error to an HTTP status."""
    try:
        return action(*args)
    except Busy as e:
        raise HTTPException(409, str(e))
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get('/api/status')
def status():
    return {'state': runtime.state, 'error': runtime.error, 'device': runtime.device, 'model': MODEL,
            'revision': REVISION, 'busy': runtime.lock.locked(), 'load_seconds': runtime.load_seconds}


@app.post('/api/analyze')
def analyze(body: Prompt):
    return respond(runtime.analyze, body.prompt)


@app.get('/api/analysis/{analysis_id}/layers/{layer}')
def layer_summary(analysis_id: str, layer: int = Path(ge=0, lt=LAYERS),
                  token: int = Query(default=-1, ge=-1, lt=CONTEXT)):
    return respond(runtime.layer_summary, analysis_id, layer, token)


@app.get('/api/analysis/{analysis_id}/layers/{layer}/neurons/{neuron}')
def neuron_trace(analysis_id: str, layer: int = Path(ge=0, lt=LAYERS), neuron: int = Path(ge=0, lt=NEURONS)):
    return respond(runtime.neuron_trace, analysis_id, layer, neuron)


@app.post('/api/stop/{run_id}')
def stop(run_id: str):
    if run_id in jobs:
        jobs[run_id].set()
    return {'ok': True}


@app.post('/api/generate')
async def generate(body: Experiment):
    """Stream the events of one comparison as newline-delimited JSON."""
    if body.run_id in jobs:
        raise HTTPException(409, 'Run ID already active')
    cancel = threading.Event()
    jobs[body.run_id] = cancel
    loop = asyncio.get_running_loop()
    events = asyncio.Queue()

    def emit(event):
        loop.call_soon_threadsafe(events.put_nowait, event)

    def worker():
        try:
            runtime.generate(body.prompt, [e.model_dump() for e in body.edits], body.max_new, cancel, emit)
        except Exception as exc:
            emit({'type': 'error', 'message': str(exc)})
        finally:
            jobs.pop(body.run_id, None)
            emit({'type': 'done', 'cancelled': cancel.is_set()})

    threading.Thread(target=worker, daemon=True).start()

    async def stream():
        try:
            while True:
                event = await events.get()
                yield json.dumps(event) + '\n'
                if event['type'] == 'done':
                    break
        finally:
            # A closed connection stops the run.
            cancel.set()

    return StreamingResponse(stream(), media_type='application/x-ndjson')


dist = FilePath(__file__).resolve().parents[1] / 'dist'
if dist.exists():
    app.mount('/', StaticFiles(directory=dist, html=True), name='frontend')
