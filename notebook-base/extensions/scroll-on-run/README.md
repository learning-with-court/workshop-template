# scroll-on-run

A small JupyterLab 4 extension that scrolls the notebook to whichever cell is
running — including cells run from outside the browser.

## Why this exists

JupyterLab already scrolls to a cell when *the browser* runs it: the front end
schedules the execution, so it knows which cell to reveal. The workshop's
notebook bridge (the `lwc` CLI's notebook tools) doesn't go through the browser.
It executes through a separate kernel client and writes results into the shared
RTC document.

From the learner's page, then, nothing was ever executed — outputs simply
materialize, often far offscreen, while they're looking at the wrong part of the
notebook. Nothing built in fixes this:

- **`showJumpToRecentExecutionButton`** keys off the front end's own
  `executionScheduled` signal, which the bridge never fires.
- **Scroll-to-collaborator-cursor** is still an unmerged PR in
  `jupyter-collaboration` (#590), and would be a manual click regardless.

So this extension watches the *document* rather than the front end's execution
signals, which means it reacts to whoever ran the cell.

## How it triggers

Per cell, from `ISharedCell.changed`:

| Change | Behaviour |
| --- | --- |
| `executionStateChange` → `running` | scroll immediately |
| `outputsChange`, `streamOutputChange`, `executionCountChange` | scroll, coalesced |
| `sourceChange` | scroll, coalesced — **off by default** |

Scrolling on the running state is the good one: it fires before any output
exists, so the cell is on screen before it starts filling in.

Source-change scrolling is opt-in because this workshop pairs notebooks with
`.py` files through jupytext. A round-trip through the paired file can rewrite
many cells at once, which would read as a scroll storm.

All four knobs live in Settings → Scroll on run.

## Building

Requires node, which learners are **not** assumed to have — hence the committed
prebuilt bundle described below.

```bash
npm install
npx tsc
npx build-labextension \
  --core-path "$(python -c 'import jupyterlab, pathlib; print(pathlib.Path(jupyterlab.__file__).parent / "staging")')" \
  .
```

Two notes on the toolchain, both of which cost time to discover:

- `jupyter labextension build` is deprecated in JupyterLab 4.6 and now shells out
  to a separate `jupyter-builder` package that this workshop's venv does not
  install. Calling `build-labextension` from `@jupyterlab/builder` directly
  avoids adding build tooling to the learner environment.
- On npm, the `latest` tag for `@jupyterlab/*` is 4.5.x while the app here is
  4.6.2, and there is no stable `@jupyterlab/builder@4.6`. So the libraries are
  pinned to `4.6.2` (they must match the host, which provides them as shared
  singletons) and the builder is the stable `4.5.10`.

## Shipping

Copy the build output to the tracked location the env build installs from:

```bash
rm -rf ../../base/.workshop/labextensions/lwc-scroll-on-run
cp -R lwc_scroll_on_run/labextension \
      ../../base/.workshop/labextensions/lwc-scroll-on-run
```

`base/**` is what `scripts/compose.ts` bakes into lesson tags, so the artifact
has to live under `base/` to reach a learner. The env build's `copyTree` step
in `.workshop/mechanics.yaml` then copies it into
`.venv/share/jupyter/labextensions/`.

Installing needs no server restart: `jupyterlab_server`'s `LabHandler.get()`
re-runs federated-extension discovery on every `/lab` page request, so a browser
refresh picks up a newly installed extension.
