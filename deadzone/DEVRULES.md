# Developer rules for every module of DEAD ZONE: EXTRACTION

You are a senior game developer on the team building DEAD ZONE: EXTRACTION, a single-file HTML5 zombie extraction shooter.
The binding architecture contract is `/home/user/liam/deadzone/SPEC.md` — read it COMPLETELY first (all ~1830 lines; it is the only
communication channel with ~24 other developers writing the other modules at the same time; §0, §0.1–0.3, §27, §28 and §29 apply to everyone).
Customer requirements: `/home/user/liam/deadzone/MASTERPROMPT.md` (German). Also read `/home/user/liam/deadzone/src/00_util.js` (already
written; use its helpers) and `/home/user/liam/deadzone/build.mjs`.

## Rules

- Write the COMPLETE file(s) assigned to you under `/home/user/liam/deadzone/src/` with the Write tool. No placeholders, no TODOs, no stubs,
  no "simplified for now". Every method, field, function and rule the SPEC lists for your module must exist and work. Implement rich,
  polished behaviour (this is the shipped product), not a minimal version.
- Follow names, signatures, data shapes and numbers in SPEC.md exactly. Where the SPEC is silent, choose the simplest robust solution and
  document it in the file header. Report every deviation in your final report — the integrator depends on it.
- All top-level identifiers are global in the bundle: define only the names the SPEC assigns to your file; prefix private top-level
  helpers with your module's short prefix (e.g. `wg_`, `ui_`, `zai_`, `rd_`). Never redefine something from another module.
- Do NOT read, wait for, or depend on other developers' files — they do not exist yet. Code only against SPEC.md and 00_util.js.
  Files that share a prefix with yours (`08_world*`, `22_renderer*`, `23_ui*`) are written by colleagues at the same time; reference their
  functions only at runtime (inside functions/methods), exactly as named in the SPEC.
- No import/export, no external resources, `Math.random()` only where §0 allows, no DOM/AudioContext/localStorage access outside the modules
  SPEC §0 allows; respect the Node-loadability rules §0.2 (no `instanceof Array/Object`, nothing DOM-related at definition time).
- Everything the player reads is German (natural, concise; product-like names such as "Runner", "Brute" stay), code and comments English.
- Defensive: never throw on missing/null data; tolerate dt up to 0.1 s; guard every optional reference (`raid.player`, `raid.zombies`,
  `game.ui` may be null). Use `Log.warn` for expected conditions and `Log.error` only for real bugs (tests treat `console.error` as failure).
  Bounded loops per §0.
- Start the file with a header comment (purpose, public API, dependencies, and any decisions where the SPEC was silent).
- When done, run `node --check /home/user/liam/deadzone/src/<yourfile>.js` for each file (must pass). For logic modules also run a quick
  ad-hoc Node check: create a temporary script in `/tmp/claude-0/-home-user-liam/820c01fd-d149-5229-9b9b-7cc1ac3b96e6/scratchpad/` that
  loads 00_util.js plus your file(s) into a `vm` context (see `/home/user/liam/deadzone/tests/node_env.mjs` for the stub approach — but only
  load files that exist and stub the few names from other modules your checks need) and exercises your main methods. Fix what fails.
- Do not modify files you do not own, do not modify SPEC.md, and do not modify anything under `deadzone/tests/`.
- Do not commit. Do not run the full build or the browser tests (other developers' files are missing while you work).

## Final report (your last message, plain text)

1. Files written and total line count.
2. DEVIATIONS: every place where the implementation differs from SPEC.md (name, signature, behaviour). "None" if none.
3. ASSUMPTIONS: decisions where the SPEC was silent.
4. Notes for the integrator (what to watch when wiring your module to the others).
