# QA brief – DEAD ZONE: EXTRACTION

You are a QA engineer for a finished single-file HTML5 zombie extraction shooter. Your job: find real, reproducible defects
and report them. **Do not edit any file under `/home/user/liam/deadzone/src/`, `index.html`, `SPEC.md` or `deadzone/tests/`** —
the lead developer fixes everything from your report.

## What exists

- Product: `/home/user/liam/index.html` (built from `/home/user/liam/deadzone/src/*.js` + `style.css` by `node deadzone/build.mjs`).
- Requirements (German): `/home/user/liam/deadzone/MASTERPROMPT.md`. Contract: `/home/user/liam/deadzone/SPEC.md` (read only the sections you need).
- Tests (all green right now): `cd /home/user/liam && node deadzone/tests/run.mjs` — `10_logic` (Node) and `20_smoke` (Playwright).
- Harness: `/home/user/liam/deadzone/tests/harness.mjs` — `openGame({touch, mobile, viewport, realtime})` returns `g` with
  `g.dz(name, ...args)`, `g.eval(fn, arg)`, `g.step(n)`, `g.key(code, down)`, `g.tap(code)`, `g.player()`, `g.screen()`, `g.state()`,
  `g.page` (Playwright page), `g.errors` (console errors). Steps are deterministic: rAF does not update the game unless `realtime:true`.
- Debug API in the page: `window.DZ` (SPEC §26): `newGame, continueGame, toBase, startRaid(mapId,{seed,missionIds}), raid(), player(), world(),
  zombies(), profile(), step(dt,n), key, mouse, aimAt(wx,wy), fire(down), teleport, giveItem, giveStash, giveCredits, spawnZombie(type,x,y),
  killAll, alertAll, noise, director, setTime, setHour, setFlag, god, extractNow, die, pathExists, nearest(kind), validateWorld, validateMissions,
  save, load, reset, ui, click(selector), screen(), Items, data{ITEMS,MISSIONS,MAPS,…}, lib{…}, game`.
- Maps: city, industrial, military, research. Zombie types: walker, runner, brute, screamer, toxic, armored, stalker, boss.

## How to work

- Write your scripts into `/tmp/claude-0/-home-user-liam/820c01fd-d149-5229-9b9b-7cc1ac3b96e6/scratchpad/qa_<yourlens>/` and run them with node.
  Example skeleton:
  ```js
  import { openGame } from '/home/user/liam/deadzone/tests/harness.mjs';
  const g = await openGame();
  await g.dz('newGame');
  await g.eval(() => window.DZ.startRaid('city', { seed: 3 }));
  await g.step(60);
  console.log(await g.player(), g.errors);
  await g.close();
  ```
- Screenshots: `await g.eval(() => window.DZ.game.render(0.016)); await g.page.screenshot({path: '<scratchpad>/qa_x/a.png'})` and view them with the Read tool.
- Read the relevant src modules to understand behaviour and to point at the exact cause.
- Be efficient: targeted scripts, no giant loops of screenshots. Stop after you have your findings (8–25 is ideal).

## Report format (your final message, plain text, no preamble)

For each finding, most severe first:
```
[high|medium|low] <file>:<line or function> – <one-line title>
Repro: <exact steps / DZ calls>
Expected: <…>  Actual: <…>
Fix: <concrete proposal>
```
Only real defects or clear gaps against MASTERPROMPT/SPEC; skip style nits and things that already work.
