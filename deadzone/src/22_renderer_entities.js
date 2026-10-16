// 22_renderer_entities.js — hoisted entity draw functions (SPEC §23.1). The ctx is already in world space.
// rdDrawZombie, rdDrawPlayer, rdDrawProp, rdDrawContainer, rdDrawFloorLoot, rdDrawProjectile, rdDrawGrenade,
// rdDrawHazard, rdDrawParticle. Each draws one entity with at most one save/restore.
// Dependencies: 00_util.js, 01/02 data (read at runtime). Math.random is allowed here (visual only).

const RDE_ZCOL = {
  walker: { body: '#5f7a4c', skin: '#8fa36d', dark: '#3d4f31' },
  runner: { body: '#7d8a6a', skin: '#b6bf98', dark: '#4e5741' },
  brute: { body: '#4a3f36', skin: '#7b6a58', dark: '#2c241e' },
  screamer: { body: '#6b5a72', skin: '#a596ab', dark: '#3f3444' },
  toxic: { body: '#4f7a25', skin: '#9bd34a', dark: '#2d4a12' },
  armored: { body: '#4d5257', skin: '#7f8a73', dark: '#2a2e31' },
  stalker: { body: '#2f3438', skin: '#626b70', dark: '#16191b' },
  boss: { body: '#5a2a24', skin: '#9a5a48', dark: '#2e1210' },
};
const RDE_CATCOL = { weapon: '#d9d9d9', ammo: '#d4b34a', medical: '#e5484d', food: '#c9893a', water: '#4aa3df', material: '#9a8a70', electronics: '#5ad1c8',
  tool: '#c47a3a', armor: '#7f9aa8', backpack: '#8a7a55', key: '#ffd34a', mission: '#ffb12b', collectible: '#d08bff', grenade: '#7fb24a' };

function rde_circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function rde_ellipse(ctx, x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
function rde_rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); }
}

function rdDrawZombie(ctx, z, raid, t) {
  const col = RDE_ZCOL[z.id] || RDE_ZCOL.walker;
  const s = (z.type && z.type.size) || 1;
  const R = z.radius || 13;
  ctx.save();
  if (z.dead) {
    const fade = clamp((25 - z.deathTimer) / 3, 0, 1) * (z.id === 'boss' ? 1 : 1);
    ctx.globalAlpha = 0.85 * fade;
    ctx.translate(z.x, z.y);
    ctx.rotate(z.angle + 1.2);
    rde_ellipse(ctx, 0, 0, R * 1.2, R * 0.7, col.dark);
    rde_circle(ctx, R * 0.9, 0, R * 0.45, col.skin);
    rde_ellipse(ctx, -R * 0.2, R * 0.5, R * 0.8, R * 0.25, 'rgba(70,10,12,0.8)');
    ctx.restore();
    return;
  }
  const alpha = z.visibleAlpha !== undefined ? z.visibleAlpha : 1;
  ctx.globalAlpha = alpha;
  // attack telegraph offset toward the player
  const p = raid && raid.player;
  let ox = 0, oy = 0;
  if (p && (z.state === 'attack' || z.state === 'ability') && z.attackAnim > 0) {
    const a = Math.atan2(p.y - z.y, p.x - z.x);
    const off = Math.sin(z.attackAnim * Math.PI) * 6;
    ox = Math.cos(a) * off; oy = Math.sin(a) * off;
  }
  let pulse = 1;
  if (z.id === 'brute' && z.attackAnim > 0.95 && z.cooldown > 0) pulse = 1.2;
  ctx.translate(z.x + ox, z.y + oy);
  // shadow
  rde_ellipse(ctx, 3, 4, R * 1.05, R * 0.8, 'rgba(0,0,0,0.28)');
  if (z.id === 'toxic') { ctx.globalAlpha = alpha * (0.25 + 0.1 * Math.sin(t * 4)); rde_circle(ctx, 0, 0, R * 2.2, '#7dff5a'); ctx.globalAlpha = alpha; }
  if (z.id === 'boss') { ctx.globalAlpha = alpha * 0.25; rde_circle(ctx, 0, 0, R * 1.6, z.phase >= 2 ? '#ff5a2a' : z.phase === 1 ? '#ff9a2a' : '#a02020'); ctx.globalAlpha = alpha; }
  ctx.rotate(z.angle);
  ctx.scale(pulse, pulse);
  const lean = z.id === 'runner' ? 4 : z.id === 'stalker' ? 3 : 0;
  // legs
  const lp = Math.sin(z.legPhase || 0);
  const legW = R * 0.32, legL = R * 0.55;
  rde_ellipse(ctx, -R * 0.15 + lp * legL * 0.6, -R * 0.38, legL * 0.6, legW, col.dark);
  rde_ellipse(ctx, -R * 0.15 - lp * legL * 0.6, R * 0.38, legL * 0.6, legW, col.dark);
  // arms (extend during attack)
  const reach = lerp(6, 18, clamp(z.attackAnim || 0, 0, 1)) * s;
  const armY = z.id === 'brute' ? R * 0.95 : R * 0.6;
  ctx.strokeStyle = col.skin; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, R * 0.3);
  ctx.beginPath();
  if (z.id === 'screamer' && z.attackAnim > 0.5) { ctx.moveTo(0, -armY); ctx.lineTo(-4, -armY - reach); ctx.moveTo(0, armY); ctx.lineTo(-4, armY + reach); }
  else { ctx.moveTo(0, -armY); ctx.lineTo(R * 0.4 + reach, -armY * 0.7); ctx.moveTo(0, armY); ctx.lineTo(R * 0.4 + reach, armY * 0.7); }
  ctx.stroke();
  // body
  const bw = z.id === 'brute' ? R * 0.9 : z.id === 'runner' || z.id === 'stalker' ? R * 0.7 : R * 0.82;
  const bh = z.id === 'brute' ? R * 1.25 : R;
  rde_ellipse(ctx, 0, 0, bw, bh, col.body);
  if (z.id === 'armored') {
    ctx.fillStyle = '#8a9298';
    rde_rrect(ctx, R * 0.15, -bh * 0.8, R * 0.55, bh * 1.6, 3); ctx.fill();
    ctx.strokeStyle = '#2a2e31'; ctx.lineWidth = 1; ctx.stroke();
  }
  if (z.id === 'toxic') { for (let i = 0; i < 4; i++) rde_circle(ctx, -R * 0.3 + i * 4, (i % 2 ? -1 : 1) * R * 0.35, 2.2, '#c6ff6a'); }
  if (z.id === 'boss') { for (let i = 0; i < 5; i++) rde_circle(ctx, -R * 0.4 + (i % 3) * R * 0.3, (i - 2) * R * 0.3, R * 0.16, col.skin); }
  // head
  const hr = z.id === 'brute' ? R * 0.42 : z.id === 'boss' ? R * 0.45 : R * 0.5;
  const hx = R * 0.35 + lean;
  rde_circle(ctx, hx, 0, hr, col.skin);
  if (z.id === 'armored') { ctx.beginPath(); ctx.arc(hx - 1, 0, hr * 1.05, Math.PI * 0.5, Math.PI * 1.5); ctx.fillStyle = '#5c6268'; ctx.fill(); }
  if (z.id === 'screamer') rde_circle(ctx, hx + hr * 0.45, 0, hr * 0.45 + (z.attackAnim || 0) * 2, '#1a0d10');
  // eyes
  ctx.fillStyle = z.id === 'stalker' ? '#ff3b3b' : z.id === 'toxic' ? '#e9ff7a' : '#d9c9a0';
  ctx.fillRect(hx + hr * 0.35, -hr * 0.45, 2, 2); ctx.fillRect(hx + hr * 0.35, hr * 0.3, 2, 2);
  // red telegraph outline during the last 40 % of the windup
  if ((z.state === 'attack' && z.windupTimer > 0 && z.attackAnim > 0.6) || (z.state === 'ability' && z.attackAnim > 0.4)) {
    ctx.strokeStyle = 'rgba(255,40,40,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, bw + 3, bh + 3, 0, 0, Math.PI * 2); ctx.stroke();
  }
  // hit flash
  if (z.flash > 0) { ctx.globalAlpha = alpha * clamp(z.flash / 0.12, 0, 1) * 0.8; rde_ellipse(ctx, 0, 0, bw + 1, bh + 1, '#ffffff'); rde_circle(ctx, hx, 0, hr + 1, '#ffffff'); }
  ctx.rotate(-z.angle);
  ctx.globalAlpha = alpha;
  // health bar
  if (z.hp < z.hpMax && z.id !== 'boss' && alpha > 0.5) {
    const w = Math.max(20, R * 2), y = -R - 10;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-w / 2, y, w, 4);
    ctx.fillStyle = z.hp / z.hpMax > 0.5 ? '#9be36a' : z.hp / z.hpMax > 0.25 ? '#f0b429' : '#e5484d';
    ctx.fillRect(-w / 2, y, w * clamp(z.hp / z.hpMax, 0, 1), 4);
  }
  if (z.state === 'stunned') { ctx.fillStyle = '#ffe680'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✦', Math.sin(t * 6) * 6, -R - 14); }
  ctx.restore();
}

function rdDrawPlayer(ctx, p, raid, t) {
  if (!p) return;
  const R = p.radius || 12;
  const sc = p.crouching ? 0.86 : 1;
  ctx.save();
  ctx.translate(p.x, p.y);
  rde_ellipse(ctx, 3, 4, R * 1.05 * sc, R * 0.85 * sc, 'rgba(0,0,0,0.3)');
  ctx.rotate(p.angle);
  ctx.scale(sc, sc);
  const lp = p.moving ? Math.sin(p.legPhase || 0) : 0;
  rde_ellipse(ctx, -2 + lp * 5, -R * 0.4, 6, 3.4, '#2b3326');
  rde_ellipse(ctx, -2 - lp * 5, R * 0.4, 6, 3.4, '#2b3326');
  // backpack
  const eq = p.equipment;
  if (eq && eq.backpack) { ctx.fillStyle = '#5a4d34'; rde_rrect(ctx, -R - 3, -R * 0.65, 8, R * 1.3, 3); ctx.fill(); }
  // weapon
  const inst = p.weaponInst;
  const d = inst ? Items.def(inst) : null;
  const cls = d && d.weapon ? d.weapon.class : null;
  const len = { pistol: 14, smg: 18, rifle: 26, shotgun: 24, sniper: 32, lmg: 28, melee: 18 }[cls] || 0;
  if (p.activeSlot === 3) { rde_circle(ctx, R * 0.9, R * 0.4, 4, '#4f6b2a'); }
  else if (p.activeSlot === 4) { ctx.fillStyle = '#e8e8e8'; ctx.fillRect(R * 0.6, R * 0.1, 8, 7); ctx.fillStyle = '#e5484d'; ctx.fillRect(R * 0.6 + 3, R * 0.1 + 1, 2, 5); ctx.fillRect(R * 0.6 + 1.5, R * 0.1 + 2.5, 5, 2); }
  else if (cls === 'melee') {
    const swing = (p.meleeAnim || 0);
    ctx.save();
    ctx.rotate(-0.9 + swing * 1.8);
    ctx.strokeStyle = '#b8b8b8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(R * 0.6, R * 0.3); ctx.lineTo(R * 0.6 + len, R * 0.3); ctx.stroke();
    ctx.restore();
    if (swing > 0.1) { ctx.strokeStyle = 'rgba(255,255,255,' + (swing * 0.5) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R + len, -0.8, 0.8); ctx.stroke(); }
  } else if (len) {
    ctx.fillStyle = '#1d1f21';
    ctx.fillRect(R * 0.3, -2.5, len, 5);
    ctx.fillStyle = cls === 'sniper' ? '#3a3f2a' : cls === 'shotgun' ? '#5a3f26' : '#2e3236';
    ctx.fillRect(R * 0.3, -3, len * 0.45, 6);
  }
  // arms
  ctx.strokeStyle = '#c9a07a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, -R * 0.65); ctx.lineTo(R * 0.75, -3); ctx.moveTo(0, R * 0.65); ctx.lineTo(R * 0.9, 2); ctx.stroke();
  // torso (vest colour when armored)
  const vest = eq && eq.armorBody;
  rde_ellipse(ctx, 0, 0, R * 0.78, R, vest ? '#4a5a3a' : '#3f4d36');
  if (vest) { ctx.fillStyle = vest.durability > 0 ? '#5f6f4a' : '#5a3a3a'; rde_rrect(ctx, -R * 0.45, -R * 0.75, R * 0.9, R * 1.5, 4); ctx.fill(); }
  // shoulder pads
  rde_circle(ctx, 0, -R * 0.8, 3.5, '#2f3a28'); rde_circle(ctx, 0, R * 0.8, 3.5, '#2f3a28');
  // head / helmet
  const helm = eq && eq.armorHead;
  rde_circle(ctx, 2, 0, 6.5, '#d2a882');
  if (helm) { ctx.beginPath(); ctx.arc(1, 0, 7.2, Math.PI * 0.35, Math.PI * 1.65); ctx.fillStyle = '#3b4a33'; ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(0, 0, 6.6, Math.PI * 0.55, Math.PI * 1.45); ctx.fillStyle = '#3a2a1e'; ctx.fill(); }
  // flashlight lens
  if (p.flashlightOn && len && cls !== 'melee') { ctx.globalAlpha = 0.9; rde_circle(ctx, R * 0.3 + len, 0, 2.2, '#fff8d0'); ctx.globalAlpha = 1; }
  if (p.hurtTimer > 0) { ctx.globalAlpha = p.hurtTimer * 2; rde_ellipse(ctx, 0, 0, R * 0.9, R * 1.05, '#ff3030'); ctx.globalAlpha = 1; }
  ctx.restore();
  // channel ring for item use
  if (p.using) {
    const f = 1 - p.using.timer / Math.max(0.01, p.using.total);
    ctx.save();
    ctx.strokeStyle = 'rgba(120,255,140,0.9)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, R + 8, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function rdDrawProp(ctx, prop, palette) {
  const x = prop.tx * TILE, y = prop.ty * TILE, w = prop.w * TILE, h = prop.h * TILE;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save();
  switch (prop.type) {
    case 'car': case 'truck': {
      const col = prop.color || '#555';
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; rde_rrect(ctx, x + 5, y + 6, w - 6, h - 6, 8); ctx.fill();
      ctx.fillStyle = col; rde_rrect(ctx, x + 3, y + 3, w - 6, h - 6, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
      const vertical = h > w;
      ctx.fillStyle = 'rgba(140,175,200,0.55)';
      if (vertical) {
        ctx.fillRect(x + 8, y + h * 0.22, w - 16, h * 0.16);
        ctx.fillRect(x + 8, y + h * 0.66, w - 16, h * 0.12);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 8, y + h * 0.4, w - 16, h * 0.24);
      } else {
        ctx.fillRect(x + w * 0.62, y + 8, w * 0.16, h - 16);
        ctx.fillRect(x + w * 0.22, y + 8, w * 0.12, h - 16);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w * 0.36, y + 8, w * 0.24, h - 16);
      }
      if (prop.type === 'truck') { ctx.fillStyle = 'rgba(0,0,0,0.2)'; if (vertical) ctx.fillRect(x + 5, y + h * 0.35, w - 10, h * 0.6); else ctx.fillRect(x + w * 0.05, y + 5, w * 0.6, h - 10); }
      break;
    }
    case 'tree': {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(cx + 6, cy + 7, 20, 0, Math.PI * 2); ctx.fill();
      const g = palette && palette.grass ? palette.grass : '#2f4a2c';
      rde_circle(ctx, cx, cy, 19, '#1d2e1b');
      rde_circle(ctx, cx - 4, cy - 3, 15, g);
      rde_circle(ctx, cx + 5, cy + 4, 11, '#3d5c36');
      rde_circle(ctx, cx - 6, cy + 5, 7, '#2a4126');
      break;
    }
    case 'dumpster':
      ctx.fillStyle = '#1f3a30'; rde_rrect(ctx, x + 2, y + 3, w - 4, h - 6, 3); ctx.fill();
      ctx.fillStyle = '#2f5144'; ctx.fillRect(x + 4, y + 5, w - 8, h - 12);
      ctx.strokeStyle = '#13241d'; ctx.beginPath(); ctx.moveTo(x + w / 2, y + 4); ctx.lineTo(x + w / 2, y + h - 4); ctx.stroke();
      break;
    case 'bench':
      ctx.fillStyle = '#4a3828'; ctx.fillRect(x + 3, y + 9, w - 6, h - 18);
      ctx.fillStyle = '#6b5236'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 3, y + 10 + i * 4, w - 6, 2);
      break;
    case 'barrel':
      rde_circle(ctx, cx + 2, cy + 3, 12, 'rgba(0,0,0,0.3)');
      rde_circle(ctx, cx, cy, 12, prop.color || '#7a3b22');
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'crate': case 'pallet':
      ctx.fillStyle = prop.type === 'pallet' ? '#8a6c44' : '#7a5f3a'; ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
      ctx.strokeStyle = '#4e3b22'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
      break;
    case 'barricade':
      ctx.fillStyle = '#5a4630';
      for (let i = 0; i < Math.max(w, h) / 10; i++) {
        if (w >= h) ctx.fillRect(x + i * 10, y + 6 + (i % 2) * 4, 9, h - 12);
        else ctx.fillRect(x + 6 + (i % 2) * 4, y + i * 10, w - 12, 9);
      }
      ctx.strokeStyle = '#c9a23a'; ctx.lineWidth = 3; ctx.beginPath();
      if (w >= h) { ctx.moveTo(x, cy - 4); ctx.lineTo(x + w, cy + 4); } else { ctx.moveTo(cx - 4, y); ctx.lineTo(cx + 4, y + h); }
      ctx.stroke();
      break;
    case 'sandbag':
      ctx.fillStyle = '#7d6e4c';
      for (let i = 0; i < Math.max(prop.w, prop.h) * 2; i++) {
        const bx = w >= h ? x + i * 16 + 8 : cx, by = w >= h ? cy : y + i * 16 + 8;
        rde_ellipse(ctx, bx, by, w >= h ? 9 : 12, w >= h ? 12 : 9, i % 2 ? '#8a7a55' : '#706245');
      }
      break;
    case 'tank':
      rde_circle(ctx, cx + 4, cy + 5, w / 2 - 2, 'rgba(0,0,0,0.35)');
      rde_circle(ctx, cx, cy, w / 2 - 3, '#5d6266');
      rde_circle(ctx, cx, cy, w / 2 - 10, '#6e7478');
      ctx.strokeStyle = '#3d4144'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, w / 2 - 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#c9a23a'; ctx.fillRect(cx - 10, cy - 2, 20, 4);
      break;
    case 'pipe':
      ctx.fillStyle = '#6a5c4e'; if (w >= h) ctx.fillRect(x, cy - 6, w, 12); else ctx.fillRect(cx - 6, y, 12, h);
      ctx.fillStyle = '#857463'; if (w >= h) ctx.fillRect(x, cy - 6, w, 4); else ctx.fillRect(cx - 6, y, 4, h);
      break;
    case 'tower':
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 6, y + 8, w, h);
      ctx.fillStyle = '#4a4232'; ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      ctx.strokeStyle = '#2a251c'; ctx.lineWidth = 2; ctx.strokeRect(x + 6, y + 6, w - 12, h - 12);
      ctx.beginPath(); ctx.moveTo(x + 2, y + 2); ctx.lineTo(x + w - 2, y + h - 2); ctx.moveTo(x + w - 2, y + 2); ctx.lineTo(x + 2, y + h - 2); ctx.stroke();
      break;
    case 'antenna':
      ctx.strokeStyle = '#9aa0a6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, cy + 10); ctx.lineTo(cx, cy - 12); ctx.lineTo(cx + 10, cy + 10); ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy); ctx.stroke();
      rde_circle(ctx, cx, cy - 12, 2.5, '#ff4040');
      break;
    case 'generator': {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 2, y + 2, w + 6, h + 4);
      ctx.fillStyle = '#9a7a22'; rde_rrect(ctx, x - 4, y - 2, w + 8, h + 4, 3); ctx.fill();
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x, y + 4, w, h - 8);
      ctx.fillStyle = prop.running ? '#59ff9c' : '#ff4040'; ctx.fillRect(x + w - 8, y + 6, 4, 4);
      break;
    }
    case 'pillar':
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 4, y + 5, w, h);
      ctx.fillStyle = prop.color || '#5b6066'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 1, y + 1, w - 2, 5);
      break;
    case 'lamp':
      rde_circle(ctx, cx, cy, 4, '#3a3a3a');
      rde_circle(ctx, cx, cy, 2.2, prop.extraction ? '#59ff9c' : '#fff1c4');
      break;
    default:
      ctx.fillStyle = prop.color || '#666'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
  }
  ctx.restore();
}

function rdDrawContainer(ctx, c, t) {
  const x = c.tx * TILE, y = c.ty * TILE;
  const op = c.opened;
  const empty = op && Array.isArray(c.items) && !c.items.some(Boolean);
  ctx.save();
  ctx.globalAlpha = empty ? 0.55 : 1;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x + 6, y + 7, 22, 22);
  switch (c.type) {
    case 'crate':
      ctx.fillStyle = op ? '#5d4a2e' : '#8a6a3c'; ctx.fillRect(x + 4, y + 4, 24, 24);
      ctx.strokeStyle = '#4a3820'; ctx.lineWidth = 2; ctx.strokeRect(x + 4, y + 4, 24, 24);
      if (op) { ctx.fillStyle = '#2a2116'; ctx.fillRect(x + 7, y + 7, 18, 18); } else { ctx.beginPath(); ctx.moveTo(x + 4, y + 16); ctx.lineTo(x + 28, y + 16); ctx.stroke(); }
      break;
    case 'military_crate':
      ctx.fillStyle = op ? '#3e4a2c' : '#566a3a'; ctx.fillRect(x + 2, y + 6, 28, 20);
      ctx.fillStyle = '#c9c39a'; if (!op) { ctx.font = 'bold 7px monospace'; ctx.fillText('MIL', x + 9, y + 19); }
      else { ctx.fillStyle = '#1e2416'; ctx.fillRect(x + 5, y + 9, 22, 14); }
      break;
    case 'locker':
      ctx.fillStyle = op ? '#4a5560' : '#68757f'; ctx.fillRect(x + 7, y + 3, 18, 26);
      ctx.strokeStyle = '#2f363c'; ctx.strokeRect(x + 7, y + 3, 18, 26);
      ctx.fillStyle = '#2f363c'; for (let i = 0; i < 3; i++) ctx.fillRect(x + 10, y + 6 + i * 3, 12, 1);
      break;
    case 'fridge':
      ctx.fillStyle = op ? '#a8adb0' : '#d6dadc'; ctx.fillRect(x + 6, y + 3, 20, 26);
      ctx.fillStyle = '#6b7073'; ctx.fillRect(x + 6, y + 13, 20, 1); ctx.fillRect(x + 22, y + 6, 2, 5);
      break;
    case 'desk':
      ctx.fillStyle = op ? '#4e3a28' : '#6b4f34'; ctx.fillRect(x + 2, y + 7, 28, 18);
      ctx.fillStyle = '#d8d0b8'; ctx.fillRect(x + 6, y + 10, 8, 6);
      ctx.fillStyle = '#222'; ctx.fillRect(x + 18, y + 10, 8, 6);
      break;
    case 'medcabinet':
      ctx.fillStyle = op ? '#b8bcbf' : '#eceff1'; ctx.fillRect(x + 5, y + 4, 22, 24);
      ctx.fillStyle = '#e5484d'; ctx.fillRect(x + 14, y + 8, 4, 14); ctx.fillRect(x + 9, y + 13, 14, 4);
      break;
    case 'safe':
      ctx.fillStyle = op ? '#2c2f33' : '#45494e'; ctx.fillRect(x + 5, y + 5, 22, 22);
      ctx.strokeStyle = '#8a8f94'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 16, y + 16, 5, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'toolbox':
      ctx.fillStyle = op ? '#8a2a22' : '#c0392b'; ctx.fillRect(x + 4, y + 10, 24, 14);
      ctx.fillStyle = '#333'; ctx.fillRect(x + 12, y + 7, 8, 3);
      break;
    case 'weapon_rack':
      ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x + 2, y + 6, 28, 20);
      ctx.strokeStyle = op ? '#555' : '#9a9a9a'; ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x + 6 + i * 7, y + 8); ctx.lineTo(x + 6 + i * 7, y + 24); ctx.stroke(); }
      break;
    case 'server_rack':
      ctx.fillStyle = '#151719'; ctx.fillRect(x + 6, y + 2, 20, 28);
      for (let i = 0; i < 5; i++) { ctx.fillStyle = (Math.floor(t * 3 + i) % 3 === 0) ? '#59ff9c' : '#1f6b3a'; ctx.fillRect(x + 9, y + 5 + i * 5, 3, 2); }
      break;
    case 'lab_cabinet':
      ctx.fillStyle = op ? '#9fb4c0' : '#d0e2ea'; ctx.fillRect(x + 4, y + 4, 24, 24);
      ctx.fillStyle = 'rgba(80,160,220,0.5)'; ctx.fillRect(x + 7, y + 7, 18, 8);
      ctx.fillStyle = '#5ad1c8'; ctx.fillRect(x + 8, y + 18, 4, 6); ctx.fillStyle = '#d08bff'; ctx.fillRect(x + 14, y + 18, 4, 6);
      break;
    case 'body': {
      ctx.globalAlpha = empty ? 0.5 : 0.95;
      ctx.translate(x + 16, y + 16); ctx.rotate(((c.tx * 7 + c.ty * 3) % 6) * 0.9);
      rde_ellipse(ctx, 0, 0, 12, 6, '#3a3328');
      rde_circle(ctx, 11, 0, 4.5, '#8a7a66');
      rde_ellipse(ctx, -4, 5, 9, 4, 'rgba(70,10,12,0.75)');
      break;
    }
    default:
      ctx.fillStyle = '#777'; ctx.fillRect(x + 6, y + 6, 20, 20);
  }
  ctx.restore();
  // unopened glint
  if (!op && c.type !== 'body') {
    const a = 0.25 + 0.25 * Math.sin(t * 3 + c.tx);
    ctx.fillStyle = 'rgba(255,240,180,' + a.toFixed(3) + ')';
    ctx.fillRect(x + 24, y + 4, 3, 3);
  }
}

function rdDrawFloorLoot(ctx, fl, t) {
  const inst = fl.inst;
  const d = Items.def(inst);
  const rar = Items.rarity(inst);
  const col = rar.color || '#aaa';
  const pulse = 0.5 + 0.5 * Math.sin(t * 3 + fl.x * 0.01);
  ctx.save();
  ctx.translate(fl.x, fl.y);
  ctx.globalAlpha = 0.25 + 0.2 * pulse;
  rde_circle(ctx, 0, 0, 13 + (rar.order || 0) * 2, col);
  ctx.globalAlpha = 1;
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#15191c'; ctx.fillRect(-6.5, -6.5, 13, 13);
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(-6.5, -6.5, 13, 13);
  ctx.rotate(-Math.PI / 4);
  rde_circle(ctx, 0, 0, 3, RDE_CATCOL[d ? d.cat : ''] || '#ccc');
  ctx.restore();
}

function rdDrawProjectile(ctx, pr) {
  const len = Math.min(pr.trail || 0, pr.cls === 'sniper' ? 70 : 36);
  if (len <= 1) return;
  const x0 = pr.x - pr.dirX * len, y0 = pr.y - pr.dirY * len;
  const g = ctx.createLinearGradient(x0, y0, pr.x, pr.y);
  g.addColorStop(0, 'rgba(255,220,140,0)');
  g.addColorStop(1, pr.cls === 'sniper' ? 'rgba(255,255,230,1)' : 'rgba(255,215,120,0.95)');
  ctx.strokeStyle = g;
  ctx.lineWidth = pr.cls === 'sniper' ? 2.4 : pr.cls === 'shotgun' ? 1.2 : 1.8;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(pr.x, pr.y); ctx.stroke();
}

function rdDrawGrenade(ctx, g) {
  ctx.save();
  rde_ellipse(ctx, g.x + 2, g.y + 3, 5, 3.5, 'rgba(0,0,0,0.35)');
  ctx.translate(g.x, g.y - (g.z || 0) * 0.35);
  ctx.rotate(g.rot || 0);
  const col = g.kind === 'molotov' ? '#7a4a1a' : g.kind === 'flash' ? '#9aa0a6' : '#4f6b2a';
  rde_circle(ctx, 0, 0, 5, col);
  if (g.kind === 'molotov') { rde_circle(ctx, 5, 0, 2.5, (Math.floor((g.fuse || 0) * 10) % 2) ? '#ffb347' : '#ff6a2a'); }
  else if (Math.floor((g.fuse || 0) * 6) % 2 === 0) rde_circle(ctx, 0, 0, 2, '#ff4040');
  ctx.restore();
}

function rdDrawHazard(ctx, h, t) {
  const life = clamp(1 - h.timer / Math.max(0.01, h.duration), 0, 1);
  ctx.save();
  if (h.kind === 'toxic') {
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
    g.addColorStop(0, 'rgba(140,240,60,' + (0.35 * life + 0.05).toFixed(3) + ')');
    g.addColorStop(0.7, 'rgba(90,180,40,' + (0.2 * life).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(60,120,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r * (0.95 + 0.05 * Math.sin(t * 3)), 0, Math.PI * 2); ctx.fill();
  } else {
    const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
    g.addColorStop(0, 'rgba(255,190,80,' + (0.45 * life).toFixed(3) + ')');
    g.addColorStop(0.6, 'rgba(255,90,30,' + (0.25 * life).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(120,30,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function rdDrawParticle(ctx, p) {
  const a = clamp(p.life / Math.max(0.001, p.maxLife), 0, 1);
  switch (p.type) {
    case 'spark':
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color; ctx.lineWidth = p.size;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025); ctx.stroke();
      break;
    case 'flash': {
      ctx.globalAlpha = a;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'casing': case 'debris':
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = p.color;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size); ctx.restore();
      break;
    case 'fire':
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2); ctx.fill();
      break;
    default:
      ctx.globalAlpha = p.type === 'smoke' || p.type === 'toxic' || p.type === 'dust' ? a * 0.8 : a;
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
