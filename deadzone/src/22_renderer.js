// 22_renderer.js — Renderer: DPR-aware canvas, chunk-cached tiles, entity pipeline, roofs, lighting overlay with
// flashlight cone, fog, screen effects, off-screen arrows, minimap, full map, menu background (SPEC §23).
// Decisions: one cached white radial sprite (scaled) cuts all lights out of the darkness; coloured light glows are
//   added with 'lighter' under the overlay; the minimap shows a 64×64-tile window around the player.
// Dependencies: 00_util.js, 08_world.js (T), 17_raid.js (darknessForHour), 22_renderer_entities.js. DOM: canvas only.

const RD_CHUNK = 16;

class Renderer {
  constructor(game, canvas) {
    this.game = game;
    this.canvas = canvas || null;
    this.ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    this.dpr = 1;
    this.w = 1280; this.h = 720;
    this.chunks = new Map();
    this.cachedWorld = null;
    this.frame = 0;
    this.t = 0;
    this.overlay = null;
    this.lightSprite = null;
    this.coneSprite = null;
    this.fogSprite = null;
    this.miniCache = null;
    this.fullCache = null;
    this.fps = 0;
    this.drawCalls = 0;
    this.menuDust = null;
  }

  get settings() { return (this.game && this.game.settings) || {}; }

  resize() {
    if (!this.canvas || typeof window === 'undefined') return;
    const w = Math.max(320, window.innerWidth || 1280), h = Math.max(240, window.innerHeight || 720);
    const q = this.settings.quality;
    const cap = q === 'high' ? 2 : q === 'medium' ? 1.5 : 1;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap);
    this.w = w; this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.game && this.game.camera) this.game.camera.resize(w, h);
    this.overlay = null;
  }

  invalidateChunks() {
    this.chunks.clear();
    this.miniCache = null;
    this.fullCache = null;
  }

  _canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    return c;
  }

  // ---------------- tiles ----------------
  _tileColors(world, map) {
    const pal = (map && map.palette) || {};
    return {
      ground: pal.ground || '#3a3d3f', road: pal.road || '#2b2d30', line: pal.roadLine || '#8a7f3f', grass: pal.grass || '#2f4a2c',
      floor: pal.floor || '#4a4440', water: pal.water || '#1f3340', wallA: pal.wallA || '#6b6259', gravel: pal.gravel || '#4d4a44',
      sidewalk: pal.sidewalk || '#55585a', toxic: pal.toxic || '#2f4d16',
    };
  }

  _shade(hex, f) {
    // f in [-1,1]: darken/lighten a #rrggbb colour
    if (typeof hex !== 'string' || hex[0] !== '#' || hex.length < 7) return hex;
    const n = parseInt(hex.slice(1, 7), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
    return 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  }

  _baseUnder(world, tx, ty) {
    for (let k = 0; k < 4; k++) {
      const t = world.tile(tx + NAV_DX[k], ty + NAV_DY[k]);
      if (t !== T.PROP_SOLID && t !== T.PROP_LOW && t !== T.WALL && t !== T.WINDOW && t !== T.VOID && t !== T.BARRICADE && t !== T.FENCE && !tileIsDoor(t)) return t === T.ROAD_LINE ? T.ROAD : t;
    }
    return T.GROUND;
  }

  _drawTile(ctx, world, C, tx, ty, px, py, override) {
    let t = override !== undefined ? override : world.tile(tx, ty);
    const v = world.tileVariant[ty * world.w + tx] || 0;
    const S = TILE;
    const bi = world.buildingIndexAtTile(tx, ty);
    const b = bi >= 0 ? world.buildings[bi] : null;
    if (t === T.PROP_SOLID || t === T.PROP_LOW || t === T.BARRICADE) t = b ? T.FLOOR : this._baseUnder(world, tx, ty);
    const dots = (col, n, size) => { ctx.fillStyle = col; for (let i = 0; i < n; i++) { const h = (tx * 73856093 ^ ty * 19349663 ^ i * 83492791) >>> 0; ctx.fillRect(px + (h % 29) + 1, py + ((h >> 5) % 29) + 1, size, size); } };
    switch (t) {
      case T.VOID: ctx.fillStyle = '#07090b'; ctx.fillRect(px, py, S, S); break;
      case T.GROUND: ctx.fillStyle = this._shade(C.ground, (v - 1.5) * 0.012); ctx.fillRect(px, py, S, S); dots('rgba(0,0,0,0.12)', 4, 2); dots('rgba(255,255,255,0.04)', 2, 1); break;
      case T.GRASS: ctx.fillStyle = this._shade(C.grass, (v - 1.5) * 0.014); ctx.fillRect(px, py, S, S); dots('rgba(120,170,90,0.18)', 6, 1); dots('rgba(0,0,0,0.15)', 3, 2); break;
      case T.GRAVEL: ctx.fillStyle = this._shade(C.gravel, (v - 1.5) * 0.014); ctx.fillRect(px, py, S, S); dots('rgba(200,190,170,0.12)', 8, 1); dots('rgba(0,0,0,0.18)', 5, 2); break;
      case T.ROAD: case T.ROAD_LINE:
        ctx.fillStyle = this._shade(C.road, (v - 1.5) * 0.008); ctx.fillRect(px, py, S, S); dots('rgba(255,255,255,0.03)', 3, 1);
        if (t === T.ROAD_LINE) {
          ctx.fillStyle = C.line;
          const vert = world.tile(tx, ty - 1) === T.ROAD_LINE || world.tile(tx, ty + 1) === T.ROAD_LINE || (world.tile(tx - 1, ty) !== T.ROAD_LINE && world.tile(tx + 1, ty) !== T.ROAD_LINE && world.tile(tx, ty - 1) === T.ROAD);
          if (vert) ctx.fillRect(px + S / 2 - 2, py + 2, 4, S - 4); else ctx.fillRect(px + 2, py + S / 2 - 2, S - 4, 4);
        }
        break;
      case T.SIDEWALK: ctx.fillStyle = this._shade(C.sidewalk, (v - 1.5) * 0.01); ctx.fillRect(px, py, S, S); ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, S - 1, S - 1); break;
      case T.FLOOR: {
        const fc = b ? b.floorColor : C.floor;
        ctx.fillStyle = this._shade(fc, (v - 1.5) * 0.012); ctx.fillRect(px, py, S, S);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        if (b && (b.type === 'house' || b.type === 'apartment' || b.type === 'office')) { for (let i = 0; i < 4; i++) ctx.fillRect(px, py + i * 8 + 7, S, 1); }
        else { ctx.fillRect(px + S - 1, py, 1, S); ctx.fillRect(px, py + S - 1, S, 1); }
        // ambient occlusion next to walls
        const wallN = tileBlocksSight(world.tile(tx, ty - 1)) || world.tile(tx, ty - 1) === T.WINDOW;
        const wallW = tileBlocksSight(world.tile(tx - 1, ty)) || world.tile(tx - 1, ty) === T.WINDOW;
        if (wallN) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(px, py, S, 6); }
        if (wallW) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(px, py, 5, S); }
        break;
      }
      case T.WALL: case T.WINDOW: {
        const wc = b ? b.wallColor : C.wallA;
        ctx.fillStyle = this._shade(wc, -0.25); ctx.fillRect(px, py, S, S);
        const above = world.tile(tx, ty - 1), below = world.tile(tx, ty + 1);
        const isW = (q) => q === T.WALL || q === T.WINDOW || tileIsDoor(q);
        ctx.fillStyle = this._shade(wc, 0.12); ctx.fillRect(px, py, S, isW(above) ? S - 6 : S - 8);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; if (!isW(above)) ctx.fillRect(px, py, S, 3);
        if (!isW(below)) { ctx.fillStyle = this._shade(wc, -0.45); ctx.fillRect(px, py + S - 6, S, 6); }
        if (t === T.WINDOW) {
          ctx.fillStyle = 'rgba(150,200,230,0.65)';
          const horiz = isW(world.tile(tx - 1, ty)) || isW(world.tile(tx + 1, ty));
          if (horiz) ctx.fillRect(px + 3, py + S / 2 - 3, S - 6, 6); else ctx.fillRect(px + S / 2 - 3, py + 3, 6, S - 6);
          ctx.fillStyle = 'rgba(255,255,255,0.35)'; if (horiz) ctx.fillRect(px + 5, py + S / 2 - 2, 6, 1); else ctx.fillRect(px + S / 2 - 2, py + 5, 1, 6);
        } else { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(px + (v * 7) % 24, py + 6, 6, 3); }
        break;
      }
      case T.DOOR_CLOSED: case T.DOOR_OPEN: case T.DOOR_LOCKED: {
        ctx.fillStyle = b ? b.floorColor : C.floor; ctx.fillRect(px, py, S, S);
        const isW = (q) => q === T.WALL || q === T.WINDOW;
        const horiz = isW(world.tile(tx - 1, ty)) || isW(world.tile(tx + 1, ty));
        if (t === T.DOOR_OPEN) {
          ctx.fillStyle = '#6b4a2a';
          if (horiz) ctx.fillRect(px, py, 5, S); else ctx.fillRect(px, py, S, 5);
        } else {
          ctx.fillStyle = t === T.DOOR_LOCKED ? '#5a2020' : '#7a5530';
          if (horiz) ctx.fillRect(px, py + S / 2 - 5, S, 10); else ctx.fillRect(px + S / 2 - 5, py, 10, S);
          ctx.fillStyle = t === T.DOOR_LOCKED ? '#ff4a3a' : '#c9a23a';
          if (horiz) ctx.fillRect(px + S - 9, py + S / 2 - 1, 3, 3); else ctx.fillRect(px + S / 2 - 1, py + S - 9, 3, 3);
        }
        break;
      }
      case T.WATER: ctx.fillStyle = C.water; ctx.fillRect(px, py, S, S); ctx.fillStyle = 'rgba(160,200,230,0.12)'; ctx.fillRect(px + 4 + v * 3, py + 10, 10, 2); ctx.fillRect(px + 14, py + 22 - v * 2, 8, 2); break;
      case T.RUBBLE: ctx.fillStyle = this._shade(C.ground, -0.1); ctx.fillRect(px, py, S, S); dots('#6d6a64', 6, 3); dots('#3a3836', 5, 2); break;
      case T.TOXIC: ctx.fillStyle = C.toxic; ctx.fillRect(px, py, S, S); dots('rgba(170,255,90,0.25)', 5, 2); break;
      case T.FENCE: {
        const base = this._baseUnder(world, tx, ty);
        this._drawTile(ctx, world, C, tx, ty, px, py, base === T.FENCE ? T.GROUND : base);
        ctx.strokeStyle = 'rgba(170,175,180,0.75)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = -S; i < S; i += 6) { ctx.moveTo(px + i, py); ctx.lineTo(px + i + S, py + S); ctx.moveTo(px + i + S, py); ctx.lineTo(px + i, py + S); }
        ctx.stroke();
        ctx.fillStyle = '#5a5f63'; ctx.fillRect(px + S / 2 - 2, py + S / 2 - 2, 4, 4);
        break;
      }
      default: ctx.fillStyle = C.ground; ctx.fillRect(px, py, S, S);
    }
  }

  _buildChunk(world, map, cx, cy) {
    const scale = Math.min(this.dpr, this.settings.quality === 'high' ? 2 : 1);
    const size = TILE * RD_CHUNK;
    let entry = this.chunks.get(cx + ',' + cy);
    if (!entry) {
      entry = { canvas: this._canvas(size * scale, size * scale), scale, last: 0 };
      this.chunks.set(cx + ',' + cy, entry);
    }
    const c = entry.canvas;
    const ctx = c.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    const C = this._tileColors(world, map);
    for (let y = 0; y < RD_CHUNK; y++) for (let x = 0; x < RD_CHUNK; x++) {
      const tx = cx * RD_CHUNK + x, ty = cy * RD_CHUNK + y;
      this._drawTile(ctx, world, C, tx, ty, x * TILE, y * TILE);
    }
    // rails (industrial)
    for (const r of world.rails || []) {
      const x0 = r.tx * TILE - cx * size, y0 = r.ty * TILE - cy * size;
      if (y0 > size + TILE || y0 + TILE < -TILE || x0 > size || x0 + r.w * TILE < 0) continue;
      ctx.fillStyle = '#4a3828';
      for (let i = 0; i < r.w * 2; i++) ctx.fillRect(x0 + i * 16 + 2, y0 - 6, 6, TILE + 12);
      ctx.fillStyle = '#9aa0a6';
      ctx.fillRect(x0, y0 + 4, r.w * TILE, 3); ctx.fillRect(x0, y0 + TILE - 7, r.w * TILE, 3);
    }
    entry.built = true;
    world.dirtyChunks.delete(cx + ',' + cy);
  }

  _drawChunks(ctx, raid, vb) {
    const world = raid.world;
    if (this.cachedWorld !== world) { this.invalidateChunks(); this.cachedWorld = world; }
    const size = TILE * RD_CHUNK;
    const cx0 = Math.max(0, Math.floor(vb.x / size)), cy0 = Math.max(0, Math.floor(vb.y / size));
    const cx1 = Math.min(Math.ceil(world.w / RD_CHUNK) - 1, Math.floor((vb.x + vb.w) / size));
    const cy1 = Math.min(Math.ceil(world.h / RD_CHUNK) - 1, Math.floor((vb.y + vb.h) / size));
    let built = 0;
    const pal = (raid.map && raid.map.palette) || {};
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = cx + ',' + cy;
      let e = this.chunks.get(key);
      const dirty = world.dirtyChunks.has(key);
      if ((!e || dirty) && built < 2) { this._buildChunk(world, raid.map, cx, cy); built++; e = this.chunks.get(key); }
      if (e && e.built) {
        e.last = this.frame;
        ctx.drawImage(e.canvas, cx * size, cy * size, size, size);
      } else {
        ctx.fillStyle = pal.ground || '#333';
        ctx.fillRect(cx * size, cy * size, size, size);
      }
      this.drawCalls++;
    }
    // LRU eviction
    if (this.chunks.size > 40) {
      const arr = Array.from(this.chunks.entries()).sort((a, b) => a[1].last - b[1].last);
      for (let i = 0; i < arr.length - 40; i++) this.chunks.delete(arr[i][0]);
    }
  }

  // ---------------- sprites ----------------
  _ensureSprites() {
    if (!this.lightSprite) {
      const c = this._canvas(256, 256), g = c.getContext('2d');
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      this.lightSprite = c;
    }
    if (!this.coneSprite) {
      const R = 400, c = this._canvas(R, R), g = c.getContext('2d');
      const half = Math.PI / 6;
      const gr = g.createRadialGradient(0, R / 2, 10, 0, R / 2, R);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, R / 2); g.arc(0, R / 2, R, -half, half); g.closePath(); g.fill();
      // soften the edges
      g.globalCompositeOperation = 'destination-out';
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 18;
      g.beginPath(); g.moveTo(0, R / 2); g.lineTo(Math.cos(-half) * R, R / 2 + Math.sin(-half) * R); g.moveTo(0, R / 2); g.lineTo(Math.cos(half) * R, R / 2 + Math.sin(half) * R); g.stroke();
      this.coneSprite = c;
    }
    if (!this.fogSprite) {
      const c = this._canvas(512, 512), g = c.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * 512, y = Math.random() * 512, r = 60 + Math.random() * 120;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(150,160,170,0.16)'); gr.addColorStop(1, 'rgba(150,160,170,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
      }
      this.fogSprite = c;
    }
  }

  _inView(vb, x, y, r = 64) { return x > vb.x - r && y > vb.y - r && x < vb.x + vb.w + r && y < vb.y + vb.h + r; }

  // ---------------- main render ----------------
  render(raid, dt) {
    const ctx = this.ctx;
    if (!ctx) return;
    this.frame++;
    this.t += dt || 0.016;
    this.drawCalls = 0;
    if (!raid || !raid.world) { this.renderMenuBackground(this.t); return; }
    const cam = this.game.camera;
    const world = raid.world, p = raid.player;
    const map = raid.map || {};
    const pal = map.palette || {};
    const t = this.t;
    this._ensureSprites();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#07090b';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.translate(this.w / 2 + cam.shakeX, this.h / 2 + cam.shakeY);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    const vb = cam.viewBounds();
    // 1. tiles
    this._drawChunks(ctx, raid, vb);
    // toxic glow (dynamic)
    const tx0 = Math.max(0, Math.floor(vb.x / TILE)), ty0 = Math.max(0, Math.floor(vb.y / TILE));
    const tx1 = Math.min(world.w - 1, Math.ceil((vb.x + vb.w) / TILE)), ty1 = Math.min(world.h - 1, Math.ceil((vb.y + vb.h) / TILE));
    const glow = 0.12 + 0.08 * Math.sin(t * 2.5);
    ctx.fillStyle = 'rgba(140,255,70,' + glow.toFixed(3) + ')';
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (world.tiles[ty * world.w + tx] === T.TOXIC) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
    // 2. decals, extraction pads, loot, containers, props
    for (const d of raid.fx.decals) {
      if (!this._inView(vb, d.x, d.y, d.r)) continue;
      ctx.globalAlpha = Math.max(0, d.alpha);
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * (0.6 + d.seed * 0.4), d.rot, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this._drawExtractions(ctx, raid, vb, t);
    this._drawPois(ctx, raid, vb, t);
    for (const c of world.containers) if (this._inView(vb, c.x, c.y)) rdDrawContainer(ctx, c, t);
    for (const fl of world.floorLoot) if (this._inView(vb, fl.x, fl.y)) rdDrawFloorLoot(ctx, fl, t);
    for (const pr of world.props) {
      const px = (pr.tx + pr.w / 2) * TILE, py = (pr.ty + pr.h / 2) * TILE;
      if (!this._inView(vb, px, py, Math.max(pr.w, pr.h) * TILE)) continue;
      if (pr.type === 'generator') pr.running = !!raid.flags.generatorOn;
      rdDrawProp(ctx, pr, pal);
    }
    // 3. hazards, grenades, zombies, player, projectiles, particles
    for (const h of raid.hazards) if (this._inView(vb, h.x, h.y, h.r)) rdDrawHazard(ctx, h, t);
    for (const z of raid.zombies.zombies) if (z.dead && this._inView(vb, z.x, z.y)) rdDrawZombie(ctx, z, raid, t);
    for (const z of raid.zombies.zombies) if (!z.dead && this._inView(vb, z.x, z.y, 80)) rdDrawZombie(ctx, z, raid, t);
    if (p && !p.dead) rdDrawPlayer(ctx, p, raid, t);
    for (const g of raid.grenades) rdDrawGrenade(ctx, g);
    for (const pr of raid.weapons.projectiles) if (this._inView(vb, pr.x, pr.y)) rdDrawProjectile(ctx, pr);
    for (const pa of raid.fx.particles) if (this._inView(vb, pa.x, pa.y, 20)) rdDrawParticle(ctx, pa);
    // 4. roofs
    const inside = p ? world.buildingAt(p.x, p.y) : null;
    this._drawRoofs(ctx, raid, vb, inside, cam.zoom);
    // coloured light glow (additive, under the darkness)
    this._drawGlows(ctx, raid, vb, t);
    // interaction ring
    if (p && p.interactTarget && !p.dead) {
      const it = p.interactTarget;
      ctx.strokeStyle = 'rgba(255,240,180,' + (0.5 + 0.3 * Math.sin(t * 6)).toFixed(3) + ')';
      ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(it.x, it.y, it.kind === 'extraction' ? 30 : 20, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // floating texts
    ctx.textAlign = 'center';
    for (const tx of raid.fx.texts) {
      ctx.globalAlpha = clamp(tx.life / tx.maxLife, 0, 1);
      ctx.font = 'bold 13px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(tx.text, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.color; ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // 5. fog (under the darkness so nights stay dark)
    if (pal.fog && this.settings.quality !== 'low') this._drawFog(ctx, pal.fog, t, cam);
    // 6. lighting
    this._drawLighting(ctx, raid, cam, vb, inside);
    // 7. screen effects
    this._drawScreenFx(ctx, raid, cam, t);
    this._drawArrows(ctx, raid, cam, t);
    if (this.settings.showFps) this._drawDebug(ctx, raid);
  }

  _drawExtractions(ctx, raid, vb, t) {
    for (const e of raid.extraction.points) {
      if (!this._inView(vb, e.x, e.y, 120)) continue;
      const active = e.active && e.state !== 'done';
      const col = active ? '89,255,156' : e.state === 'locked' ? '229,72,77' : '150,155,160';
      ctx.fillStyle = 'rgba(' + col + ',0.08)';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(' + col + ',0.85)'; ctx.lineWidth = 2;
      ctx.setLineDash([10, 8]); ctx.lineDashOffset = -t * 20;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      if (e.state === 'extracting' && e.duration) {
        ctx.strokeStyle = 'rgba(89,255,156,1)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.radius - 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(e.progress / e.duration, 0, 1)); ctx.stroke();
      }
      ctx.font = 'bold 12px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(e.name, e.x + 1, e.y - e.radius - 7);
      ctx.fillStyle = 'rgba(' + col + ',1)'; ctx.fillText(e.name, e.x, e.y - e.radius - 8);
      if (!active && e.lockReason) { ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.fillStyle = 'rgba(220,220,220,0.85)'; ctx.fillText(e.lockReason, e.x, e.y - e.radius + 8); }
      // landing pad marking
      ctx.strokeStyle = 'rgba(' + col + ',0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(e.x - 14, e.y - 14); ctx.lineTo(e.x + 14, e.y + 14); ctx.moveTo(e.x + 14, e.y - 14); ctx.lineTo(e.x - 14, e.y + 14); ctx.stroke();
    }
  }

  _missionTargets(raid) {
    // world positions for unfinished mission objectives with a known location
    const out = [];
    const w = raid.world;
    for (const st of raid.missionStates || []) {
      for (const o of [...st.objectives, ...st.optional]) {
        if (o.done) continue;
        const d = o.def;
        if (d.type === 'investigate') for (const poi of w.pois) { if (poi.type === d.target && !poi.used) out.push({ x: poi.x, y: poi.y, label: (MS_POI_NAMES[poi.type] || poi.type) }); }
        else if (d.type === 'generator') for (const poi of w.pois) { if (poi.type === 'generator' && !raid.flags.generatorOn) out.push({ x: poi.x, y: poi.y, label: 'Generator' }); }
        else if (d.type === 'kill_boss' && w.bossArena) out.push({ x: w.bossArena.x, y: w.bossArena.y, label: 'Boss' });
        else if (d.type === 'extract_at') { const e = w.extractions.find(x => x.id === d.target); if (e) out.push({ x: e.x, y: e.y, label: e.name }); }
        else if (d.type === 'retrieve') {
          const fl = w.floorLoot.find(f => f.inst && f.inst.id === d.target);
          if (fl) out.push({ x: fl.x, y: fl.y, label: (Items.def(d.target) || {}).name || 'Ziel' });
          else { const c = w.containers.find(c => (c.preset || []).some(i => i.id === d.target) || (Array.isArray(c.items) && c.items.some(i => i && i.id === d.target))); if (c) { const b = w.buildings.find(bb => bb.id === c.buildingId); out.push({ x: b ? (b.tx + b.w / 2) * TILE : c.x, y: b ? (b.ty + b.h / 2) * TILE : c.y, label: (Items.def(d.target) || {}).name || 'Ziel', area: true }); } }
        }
      }
    }
    return out;
  }

  _drawPois(ctx, raid, vb, t) {
    for (const m of this._missionTargets(raid)) {
      if (!this._inView(vb, m.x, m.y, 80)) continue;
      const r = m.area ? 90 : 26 + Math.sin(t * 3) * 3;
      ctx.strokeStyle = 'rgba(255,209,74,0.8)'; ctx.lineWidth = 2;
      ctx.setLineDash(m.area ? [6, 10] : []);
      ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,209,74,0.95)';
      ctx.beginPath(); ctx.moveTo(m.x, m.y - r - 4); ctx.lineTo(m.x - 6, m.y - r - 14); ctx.lineTo(m.x + 6, m.y - r - 14); ctx.closePath(); ctx.fill();
    }
  }

  _drawRoofs(ctx, raid, vb, inside, zoom) {
    const w = raid.world;
    const p = raid.player;
    for (const b of w.buildings) {
      const x = b.tx * TILE, y = b.ty * TILE, bw = b.w * TILE, bh = b.h * TILE;
      if (x > vb.x + vb.w || y > vb.y + vb.h || x + bw < vb.x || y + bh < vb.y) continue;
      if (b === inside) continue;
      // near the building the roof fades slightly so doors stay readable
      let alpha = 1;
      if (p) {
        const dx = Math.max(x - p.x, 0, p.x - (x + bw)), dy = Math.max(y - p.y, 0, p.y - (y + bh));
        const d = Math.hypot(dx, dy);
        if (d < 40) alpha = 0.82 + d / 40 * 0.18;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x + 6, y + 8, bw, bh);
      ctx.fillStyle = b.roofColor;
      ctx.fillRect(x - 2, y - 4, bw + 4, bh + 4);
      ctx.fillStyle = this._shade(b.roofColor, -0.18);
      if (bw >= bh) { ctx.fillRect(x - 2, y - 4 + bh / 2, bw + 4, bh / 2 + 4); }
      else { ctx.fillRect(x - 2 + bw / 2, y - 4, bw / 2 + 4, bh + 4); }
      ctx.strokeStyle = this._shade(b.roofColor, -0.4); ctx.lineWidth = 2;
      ctx.strokeRect(x - 2, y - 4, bw + 4, bh + 4);
      ctx.strokeStyle = this._shade(b.roofColor, 0.15); ctx.lineWidth = 2;
      ctx.beginPath();
      if (bw >= bh) { ctx.moveTo(x + 4, y - 4 + bh / 2); ctx.lineTo(x + bw - 4, y - 4 + bh / 2); }
      else { ctx.moveTo(x - 2 + bw / 2, y + 2); ctx.lineTo(x - 2 + bw / 2, y + bh - 8); }
      ctx.stroke();
      // roof details: vents / AC units
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      if (b.w >= 8) ctx.fillRect(x + bw * 0.2, y + bh * 0.2, 14, 10);
      if (b.locked) { ctx.fillStyle = 'rgba(229,72,77,0.55)'; ctx.fillRect(x + bw / 2 - 18, y + bh / 2 - 18, 36, 36); }
      if (zoom >= 0.9 && b.w >= 8) {
        ctx.font = '600 11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(b.name, x + bw / 2 + 1, y + bh / 2 + 5);
        ctx.fillStyle = 'rgba(235,235,225,0.7)'; ctx.fillText(b.name, x + bw / 2, y + bh / 2 + 4);
      }
    }
    ctx.globalAlpha = 1;
  }

  _visibleLights(raid, vb) {
    const w = raid.world;
    const out = [];
    const size = TILE * RD_CHUNK;
    if (w.lightBuckets) {
      const cx0 = Math.floor((vb.x - 200) / size), cy0 = Math.floor((vb.y - 200) / size);
      const cx1 = Math.floor((vb.x + vb.w + 200) / size), cy1 = Math.floor((vb.y + vb.h + 200) / size);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const b = w.lightBuckets.get(cx + ',' + cy);
        if (b) for (const l of b) out.push(l);
      }
    } else out.push(...w.lights);
    const cxm = vb.x + vb.w / 2, cym = vb.y + vb.h / 2;
    if (out.length > 24) out.sort((a, b) => dist2(a.x, a.y, cxm, cym) - dist2(b.x, b.y, cxm, cym));
    return out.slice(0, 24);
  }

  _flicker(l) {
    if (!l.flicker) return 1;
    const s = Math.sin(this.t * 13 + l.x * 0.07) * Math.sin(this.t * 7.3 + l.y * 0.05);
    return s > 0.85 ? 0.25 : 0.85 + 0.15 * s;
  }

  _drawGlows(ctx, raid, vb, t) {
    if (raid.darkness < 0.2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const sp = this.lightSprite;
    for (const l of this._visibleLights(raid, vb)) {
      if (l.indoor && !raid.flags.generatorOn && raid.map && raid.map.layout === 'campus') continue;
      const r = l.radius * 0.8;
      ctx.globalAlpha = 0.16 * this._flicker(l) * clamp(raid.darkness * 1.4, 0, 1);
      if (l.color) { ctx.fillStyle = l.color; }
      // tint by drawing the sprite then colouring via a filled circle (cheap: coloured circle with soft sprite alpha)
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      g.addColorStop(0, l.color || '#ffd79a'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, Math.PI * 2); ctx.fill();
    }
    for (const h of raid.hazards) {
      if (h.kind !== 'fire') continue;
      ctx.globalAlpha = 0.35;
      ctx.drawImage(sp, h.x - h.r * 2, h.y - h.r * 2, h.r * 4, h.r * 4);
    }
    ctx.restore();
    void sp; void t;
  }

  _drawLighting(ctx, raid, cam, vb, inside) {
    const d = clamp(raid.darkness, 0, 0.92);
    const indoorDark = !!inside;
    if (d < 0.05 && !indoorDark) return;
    const q = this.settings.quality;
    const s = q === 'high' ? 0.5 : 0.33;
    const W = Math.ceil(this.w * s), H = Math.ceil(this.h * s);
    if (!this.overlay || this.overlay.width !== W || this.overlay.height !== H) this.overlay = this._canvas(W, H);
    const o = this.overlay.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, W, H);
    const hr = raid.hour;
    const dusk = (hr >= 17 && hr < 20) || (hr >= 5 && hr < 8);
    o.fillStyle = dusk ? 'rgba(40,22,10,' + d.toFixed(3) + ')' : 'rgba(5,8,14,' + d.toFixed(3) + ')';
    o.fillRect(0, 0, W, H);
    // world transform for the overlay
    o.setTransform(s * cam.zoom, 0, 0, s * cam.zoom, s * (this.w / 2 + cam.shakeX - cam.x * cam.zoom), s * (this.h / 2 + cam.shakeY - cam.y * cam.zoom));
    // indoor darkness
    o.fillStyle = 'rgba(0,0,0,0.35)';
    for (const b of raid.world.buildings) {
      const x = b.tx * TILE, y = b.ty * TILE;
      if (x > vb.x + vb.w || y > vb.y + vb.h || x + b.w * TILE < vb.x || y + b.h * TILE < vb.y) continue;
      if (b !== inside) continue; // roofs already hide other interiors
      o.fillRect(x, y, b.w * TILE, b.h * TILE);
    }
    o.globalCompositeOperation = 'destination-out';
    const sp = this.lightSprite;
    const p = raid.player;
    const cut = (x, y, r, a) => { o.globalAlpha = clamp(a, 0, 1); o.drawImage(sp, x - r, y - r, r * 2, r * 2); };
    if (p && !p.dead) cut(p.x, p.y, 95, 0.55);
    for (const l of this._visibleLights(raid, vb)) {
      let a = this._flicker(l);
      if (l.indoor && raid.map && raid.map.layout === 'campus' && !raid.flags.generatorOn) a *= 0.3;
      cut(l.x, l.y, l.radius, a * 0.95);
    }
    for (const f of raid.fx.lightFlashes) cut(f.x, f.y, f.r, clamp(f.ttl * 8, 0, 1));
    for (const h of raid.hazards) if (h.kind === 'fire') cut(h.x, h.y, h.r * 2.2, 0.9);
    for (const e of raid.extraction.points) if (e.active && e.state !== 'done') cut(e.x, e.y, 120, 0.6);
    if (p && !p.dead && p.flashlightOn) {
      o.save();
      o.translate(p.x, p.y);
      o.rotate(p.angle);
      o.globalAlpha = 1;
      o.drawImage(this.coneSprite, 0, -200, 400, 400);
      o.drawImage(this.coneSprite, 0, -200, 400, 400);
      o.restore();
    }
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.overlay, 0, 0, this.w, this.h);
    ctx.restore();
  }

  _drawFog(ctx, fog, t, cam) {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 0.22;
    const sp = this.fogSprite;
    const size = 900;
    for (let i = 0; i < 2; i++) {
      const ox = ((-cam.x * (0.3 + i * 0.1) + t * (8 + i * 5)) % size + size) % size - size;
      const oy = ((-cam.y * (0.3 + i * 0.1) + t * (3 + i * 2)) % size + size) % size - size;
      for (let x = ox; x < this.w; x += size) for (let y = oy; y < this.h; y += size) ctx.drawImage(sp, x, y, size, size);
    }
    ctx.globalCompositeOperation = 'source-atop';
    ctx.restore();
    void fog;
  }

  _drawScreenFx(ctx, raid, cam, t) {
    const se = raid.fx.screenEffects;
    const W = this.w, H = this.h;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const p = raid.player;
    // low hp pulse + damage vignette
    const low = p && !p.dead && p.hp < p.hpMax * 0.3 ? (0.25 + 0.15 * Math.sin(t * 5)) : 0;
    const dmg = Math.max(se.damage * 0.8, low);
    if (dmg > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(160,0,0,0)'); g.addColorStop(1, 'rgba(160,0,0,' + dmg.toFixed(3) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // toxic tint
    if (p && p.toxic > 0) { ctx.fillStyle = 'rgba(90,200,40,' + (0.08 + 0.04 * Math.sin(t * 3)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    // hit direction arcs
    if (p) {
      const sp = cam.worldToScreen(p.x, p.y);
      const R = Math.min(W, H) * 0.42;
      for (const hd of se.hitDirs) {
        ctx.strokeStyle = 'rgba(255,40,40,' + clamp(hd.ttl / 0.8, 0, 1).toFixed(3) + ')';
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.arc(sp.x, sp.y, R, hd.angle - 0.44, hd.angle + 0.44); ctx.stroke();
      }
    }
    // hit marker
    if (se.hitMarker > 0) {
      const m = this.game.input ? this.game.input.mouse : { x: W / 2, y: H / 2 };
      const cx = this.game.input && this.game.input.touchMode && p ? cam.worldToScreen(p.x + Math.cos(p.angle) * 120, p.y + Math.sin(p.angle) * 120).x : m.x;
      const cy = this.game.input && this.game.input.touchMode && p ? cam.worldToScreen(p.x + Math.cos(p.angle) * 120, p.y + Math.sin(p.angle) * 120).y : m.y;
      ctx.strokeStyle = 'rgba(255,255,255,' + clamp(se.hitMarker / 0.12, 0, 1).toFixed(3) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.moveTo(cx + dx * 5, cy + dy * 5); ctx.lineTo(cx + dx * 11, cy + dy * 11); }
      ctx.stroke();
    }
    // flashbang
    if (se.flash > 0.01) { ctx.fillStyle = 'rgba(255,255,255,' + clamp(se.flash, 0, 1).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  _drawArrows(ctx, raid, cam, t) {
    const p = raid.player;
    if (!p) return;
    const W = this.w, H = this.h, m = 34;
    const targets = [];
    for (const e of raid.extraction.points) if (e.active && e.state !== 'done') targets.push({ x: e.x, y: e.y, col: '#59ff9c', label: e.name });
    for (const mt of this._missionTargets(raid)) targets.push({ x: mt.x, y: mt.y, col: '#ffd14a', label: mt.label });
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    for (const tg of targets) {
      const s = cam.worldToScreen(tg.x, tg.y);
      if (s.x > m && s.y > m && s.x < W - m && s.y < H - m) continue;
      const cx = W / 2, cy = H / 2;
      const a = Math.atan2(s.y - cy, s.x - cx);
      const kx = (W / 2 - m) / Math.max(0.001, Math.abs(Math.cos(a))), ky = (H / 2 - m) / Math.max(0.001, Math.abs(Math.sin(a)));
      const k = Math.min(kx, ky);
      const ax = cx + Math.cos(a) * k, ay = cy + Math.sin(a) * k;
      ctx.save();
      ctx.translate(ax, ay); ctx.rotate(a);
      ctx.fillStyle = tg.col; ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 4);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
      const dm = Math.round(dist(p.x, p.y, tg.x, tg.y) / TILE);
      ctx.font = '600 11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = tg.col;
      ctx.fillText(dm + ' m', ax - Math.cos(a) * 22, ay - Math.sin(a) * 22 + 4);
    }
    ctx.restore();
  }

  _drawDebug(ctx, raid) {
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(8, this.h - 96, 220, 88);
    ctx.fillStyle = '#9fe870'; ctx.font = '12px ui-monospace, Consolas, monospace'; ctx.textAlign = 'left';
    const g = this.game;
    const lines = [
      'FPS ' + (g.fps || 0).toFixed(0) + '  Draw ' + this.drawCalls,
      'Zombies ' + raid.zombies.aliveCount() + '/' + raid.zombies.zombies.length,
      'Partikel ' + raid.fx.particles.length + '  Projektile ' + raid.weapons.projectiles.length,
      'Chunks ' + this.chunks.size + '  Lichter ' + raid.world.lights.length,
      'Seed ' + raid.seed + '  ' + formatHour(raid.hour),
    ];
    lines.forEach((l, i) => ctx.fillText(l, 16, this.h - 78 + i * 15));
    ctx.restore();
  }

  // ---------------- maps ----------------
  _tileMapColor(world, map, tx, ty) {
    const t = world.tile(tx, ty);
    const pal = (map && map.palette) || {};
    if (world.buildingIndexAtTile(tx, ty) >= 0) return t === T.FLOOR || tileIsDoor(t) ? '#5a5650' : '#8a847a';
    switch (t) {
      case T.VOID: return '#050607';
      case T.ROAD: case T.ROAD_LINE: return '#24272a';
      case T.SIDEWALK: return '#4a4d50';
      case T.GRASS: return pal.grass || '#2f4a2c';
      case T.WATER: return pal.water || '#1f3340';
      case T.TOXIC: return '#4f8a1d';
      case T.FENCE: return '#6a6e72';
      case T.PROP_SOLID: case T.PROP_LOW: case T.BARRICADE: return '#3c3a36';
      case T.GRAVEL: return pal.gravel || '#4d4a44';
      case T.RUBBLE: return '#4a4744';
      case T.WALL: return '#7a746a';
      default: return pal.ground || '#3a3d3f';
    }
  }

  _mapImage(world, map) {
    const c = this._canvas(world.w, world.h);
    const g = c.getContext('2d');
    const img = g.createImageData(world.w, world.h);
    const cache = new Map();
    for (let ty = 0; ty < world.h; ty++) for (let tx = 0; tx < world.w; tx++) {
      const col = this._tileMapColor(world, map, tx, ty);
      let rgb = cache.get(col);
      if (!rgb) {
        const n = parseInt(col.slice(1), 16);
        rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        cache.set(col, rgb);
      }
      const i = (ty * world.w + tx) * 4;
      img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2]; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  renderMinimap(raid, canvasEl, size = 180) {
    if (!raid || !raid.world || !canvasEl) return;
    const w = raid.world;
    if (!this.miniCache || this.miniCache.world !== w || this.miniCache.version !== w.version) {
      this.miniCache = { world: w, version: w.version, img: this._mapImage(w, raid.map) };
    }
    const dpr = Math.min(2, this.dpr || 1);
    const px = Math.round(size * dpr);
    if (canvasEl.width !== px) { canvasEl.width = px; canvasEl.height = px; }
    const g = canvasEl.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;
    const p = raid.player;
    const span = 64; // tiles
    const scale = size / span;
    const cx = p.x / TILE, cy = p.y / TILE;
    g.fillStyle = '#050607'; g.fillRect(0, 0, size, size);
    g.drawImage(this.miniCache.img, cx - span / 2, cy - span / 2, span, span, 0, 0, size, size);
    const toM = (x, y) => ({ x: (x / TILE - cx) * scale + size / 2, y: (y / TILE - cy) * scale + size / 2 });
    // noise markers
    for (const n of raid.noiseMarkers) {
      const m = toM(n.x, n.y);
      g.strokeStyle = 'rgba(255,200,80,' + clamp(n.ttl, 0, 1) * 0.6 + ')'; g.lineWidth = 1;
      g.beginPath(); g.arc(m.x, m.y, (1.2 - n.ttl) * 30 + 3, 0, Math.PI * 2); g.stroke();
    }
    for (const z of raid.zombies.zombies) {
      if (z.dead || dist(z.x, z.y, p.x, p.y) > 320) continue;
      if (z.visibleAlpha !== undefined && z.visibleAlpha < 0.5) continue;
      const m = toM(z.x, z.y);
      g.fillStyle = z.id === 'boss' ? '#ff3a3a' : '#e5484d'; g.fillRect(m.x - 1.5, m.y - 1.5, 3, 3);
    }
    for (const mt of this._missionTargets(raid)) { const m = toM(mt.x, mt.y); this._miniIcon(g, m, size, '#ffd14a'); }
    for (const e of raid.extraction.points) { const m = toM(e.x, e.y); this._miniIcon(g, m, size, e.active && e.state !== 'done' ? '#59ff9c' : '#8a8f94', true); }
    // player arrow
    g.save(); g.translate(size / 2, size / 2); g.rotate(p.angle);
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(7, 0); g.lineTo(-4, -4.5); g.lineTo(-2, 0); g.lineTo(-4, 4.5); g.closePath(); g.fill();
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.strokeRect(0.5, 0.5, size - 1, size - 1);
  }

  _miniIcon(g, m, size, col, square) {
    const x = clamp(m.x, 4, size - 4), y = clamp(m.y, 4, size - 4);
    g.fillStyle = col;
    if (square) g.fillRect(x - 3.5, y - 3.5, 7, 7);
    else { g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); }
    if (x !== m.x || y !== m.y) { g.strokeStyle = col; g.lineWidth = 1; g.strokeRect(x - 5, y - 5, 10, 10); }
  }

  renderFullMap(raid, canvasEl) {
    if (!raid || !raid.world || !canvasEl) return;
    const w = raid.world;
    const rect = canvasEl.getBoundingClientRect ? canvasEl.getBoundingClientRect() : { width: 600, height: 600 };
    const size = Math.max(200, Math.floor(Math.min(rect.width || 600, rect.height || 600)));
    const dpr = Math.min(2, this.dpr || 1);
    canvasEl.width = Math.round(size * dpr); canvasEl.height = Math.round(size * dpr);
    const g = canvasEl.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.fullCache || this.fullCache.world !== w || this.fullCache.version !== w.version) this.fullCache = { world: w, version: w.version, img: this._mapImage(w, raid.map) };
    const scale = size / Math.max(w.w, w.h);
    g.fillStyle = '#050607'; g.fillRect(0, 0, size, size);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.fullCache.img, 0, 0, w.w * scale, w.h * scale);
    const toM = (x, y) => ({ x: x / TILE * scale, y: y / TILE * scale });
    g.font = '600 10px "Segoe UI", system-ui, sans-serif'; g.textAlign = 'center';
    for (const b of w.buildings) {
      if (b.w * b.h < 80 && !b.locked) continue;
      const m = toM((b.tx + b.w / 2) * TILE, (b.ty + b.h / 2) * TILE);
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillText(b.name, m.x + 1, m.y + 1);
      g.fillStyle = b.locked ? '#ff8080' : 'rgba(230,230,220,0.85)'; g.fillText(b.name, m.x, m.y);
    }
    for (const mt of this._missionTargets(raid)) {
      const m = toM(mt.x, mt.y);
      g.fillStyle = '#ffd14a'; g.beginPath(); g.arc(m.x, m.y, 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffe9a0'; g.fillText(mt.label, m.x, m.y - 9);
    }
    const showWindows = (this.game.profileMgr && this.game.profileMgr.profile && this.game.profileMgr.profile.upgrades.radio >= 1);
    g.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
    for (const e of raid.extraction.points) {
      const m = toM(e.x, e.y);
      const col = e.active && e.state !== 'done' ? '#59ff9c' : e.state === 'locked' ? '#e5484d' : '#b0b5ba';
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.arc(m.x, m.y, Math.max(5, e.radius / TILE * scale), 0, Math.PI * 2); g.stroke();
      g.fillStyle = col; g.fillRect(m.x - 3, m.y - 3, 6, 6);
      let label = e.name;
      if (!e.active && e.lockReason) label += ' – ' + e.lockReason;
      if (e.kind === 'timed' && showWindows && e.window) label += ' (' + formatTime(e.window[0]) + '–' + formatTime(e.window[1]) + ')';
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillText(label, m.x + 1, m.y - 11);
      g.fillStyle = col; g.fillText(label, m.x, m.y - 12);
    }
    if (w.bossArena) { const m = toM(w.bossArena.x, w.bossArena.y); g.fillStyle = '#ff3a3a'; g.font = 'bold 14px sans-serif'; g.fillText('☠', m.x, m.y + 5); }
    const p = raid.player;
    if (p) {
      const m = toM(p.x, p.y);
      g.save(); g.translate(m.x, m.y); g.rotate(p.angle);
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -6); g.lineTo(-2, 0); g.lineTo(-5, 6); g.closePath(); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.arc(m.x, m.y, 12 + Math.sin(this.t * 4) * 2, 0, Math.PI * 2); g.stroke();
    }
  }

  renderMenuBackground(t) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w, H = this.h;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1014'); g.addColorStop(0.6, '#121a1f'); g.addColorStop(1, '#1d1712');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // distant ruined skyline
    ctx.fillStyle = '#0a0d10';
    const base = H * 0.72;
    for (let i = 0; i < 26; i++) {
      const x = (i * 97 + 13) % (W + 120) - 60, bw = 40 + (i * 37) % 70, bh = 60 + (i * 53) % 180;
      ctx.fillRect(x, base - bh, bw, bh + H);
      if (i % 4 === 0) { ctx.fillRect(x + bw * 0.3, base - bh - 18, 6, 18); }
    }
    // glow of fires on the horizon
    const fg = ctx.createRadialGradient(W * 0.7, base, 0, W * 0.7, base, W * 0.5);
    fg.addColorStop(0, 'rgba(255,110,40,0.18)'); fg.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
    // drifting ash
    if (!this.menuDust) { this.menuDust = []; for (let i = 0; i < 70; i++) this.menuDust.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.8, v: 0.01 + Math.random() * 0.03 }); }
    ctx.fillStyle = 'rgba(220,210,200,0.45)';
    for (const d of this.menuDust) {
      const x = ((d.x + t * d.v * 0.6) % 1) * W, y = ((d.y + t * d.v) % 1) * H;
      ctx.fillRect(x, y, d.s, d.s);
    }
    this._ensureSprites();
    ctx.globalAlpha = 0.18;
    const ox = (t * 12) % 900;
    for (let x = -ox; x < W; x += 900) ctx.drawImage(this.fogSprite, x, H * 0.45, 900, 600);
    ctx.globalAlpha = 1;
  }
}
