// Generates Assets/_Project/Scripts/Core/Data/DataTables.Generated.cs from the data tables of the
// HTML version (deadzone/src/01..04_data_*.js), so both versions share one source of truth.
// Usage (repo root): node DeadZone3D/Tools/gen_data.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGameEnv } from '../../deadzone/tests/node_env.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '../Assets/_Project/Scripts/Core/Data/DataTables.Generated.cs');
const env = loadGameEnv();

const TABLES = [
  ['ITEMS', 'dict', 'ItemDef'], ['ZOMBIE_TYPES', 'dict', 'ZombieDef'], ['MAPS', 'dict', 'MapDef'],
  ['MISSIONS', 'list', 'MissionDef'], ['UPGRADES', 'dictlist', 'UpgradeLevel'], ['RECIPES', 'list', 'RecipeDef'],
  ['TRADER_STOCK', 'list', 'TraderLine'], ['LOOT_TABLES', 'dict', 'LootTable'], ['RARITY', 'dict', 'RarityDef'],
  ['XP_REWARDS', 'object', 'XpRewardsDef'], ['ECONOMY', 'object', 'EconomyDef'],
  ['AMMO_CALIBERS', 'strdict'], ['CONTAINER_NAMES', 'strdict'], ['BUILDING_NAMES', 'strdict'], ['CATEGORY_NAMES', 'strdict'],
  ['MS_POI_NAMES', 'strdict'], ['EQUIP_SLOT_NAMES', 'strdict'], ['MAP_ORDER', 'strlist'], ['EQUIP_SLOTS', 'strlist'],
];
const CLASS_OF = {
  'ItemDef.weapon': 'WeaponStats', 'ItemDef.grenade': 'GrenadeStats', 'ItemDef.ammo': 'AmmoStats', 'ItemDef.medical': 'MedicalStats',
  'ItemDef.food': 'FoodStats', 'ItemDef.water': 'WaterStats', 'ItemDef.armor': 'ArmorStats', 'ItemDef.backpack': 'BackpackStats',
  'ItemDef.key': 'KeyStats', 'ItemDef.mission': 'MissionItemStats', 'ZombieDef.dropTable': 'DropEntry', 'ZombieDef.phases': 'BossPhase',
  'MapDef.size': 'MapSize', 'MapDef.palette': 'MapPalette', 'MapDef.buildings': 'BuildingSpec', 'MapDef.zombies': 'ZombieSpawnSpec',
  'MapDef.extractions': 'ExtractionSpec', 'MissionDef.objectives': 'ObjectiveDef', 'MissionDef.optional': 'ObjectiveDef',
  'MissionDef.rewards': 'RewardDef', 'MissionDef.optionalRewards': 'RewardDef', 'RewardDef.items': 'ItemCount',
  'UpgradeLevel.cost': 'CostDef', 'CostDef.items': 'ItemCount', 'UpgradeLevel.effect': 'UpgradeEffect',
  'RecipeDef.inputs': 'ItemCount', 'RecipeDef.output': 'ItemCount', 'LootTable.entries': 'LootEntry',
};
const DICT_OF = { 'MapDef.props': 'int', 'ZombieSpawnSpec.weights': 'double' };
const INT_KEYS = new Set(['value', 'stack', 'durabilityMax', 'magSize', 'pellets', 'tier', 'level', 'credits', 'xp', 'count', 'slots',
  'requiresLevel', 'unlockLevel', 'radioUnlock', 'difficulty', 'minLevel', 'maxAlive', 'lootTier', 'order', 'stashSlots', 'missionSlots',
  'recipeTier', 'hpMax', 'summonCount', 'minTier', 'penetration', 'toxicZones', 'lootTierBase', 'startHour', 'secureSlots', 'carryBonus', 'traderTier']);
const INT_ARRAY_KEYS = new Set(['count', 'w', 'h', 'containerCount', 'rolls', 'dropRolls', 'stock']);
const INT_SCALAR_IN = { MapSize: ['w', 'h'] };
const KEYWORDS = new Set(['abstract','as','base','bool','break','byte','case','catch','char','checked','class','const','continue','decimal','default','delegate','do','double','else','enum','event','explicit','extern','false','finally','fixed','float','for','foreach','goto','if','implicit','in','int','interface','internal','is','lock','long','namespace','new','null','object','operator','out','override','params','private','protected','public','readonly','ref','return','sbyte','sealed','short','sizeof','stackalloc','static','string','struct','switch','this','throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort','using','virtual','void','volatile','while']);
const id = k => (KEYWORDS.has(k) ? '@' + k : k);

const classes = new Map(); // name -> Map(key -> type descriptor)
function typeOf(cls, key, values) {
  const nonNull = values.filter(v => v !== null && v !== undefined);
  const nullable = values.some(v => v === null);
  const pathKey = cls + '.' + key;
  if (DICT_OF[pathKey]) return { t: 'dict', of: DICT_OF[pathKey] };
  if (!nonNull.length) return { t: 'string' };
  const kinds = new Set(nonNull.map(v => (Array.isArray(v) ? 'array' : typeof v)));
  if (kinds.size > 1) throw new Error('mixed types at ' + pathKey + ': ' + [...kinds]);
  const k = [...kinds][0];
  if (k === 'string') return { t: 'string' };
  if (k === 'boolean') return { t: 'bool' };
  if (k === 'number') {
    const allInt = nonNull.every(Number.isInteger);
    const isInt = allInt && (INT_KEYS.has(key) || (INT_SCALAR_IN[cls] || []).includes(key));
    return { t: isInt ? 'int' : 'double', nullable };
  }
  if (k === 'array') {
    const items = nonNull.flat();
    if (!items.length) return { t: 'array', of: { t: 'string' } };
    const ik = new Set(items.map(v => typeof v));
    if (ik.size > 1) throw new Error('mixed array at ' + pathKey);
    const it = [...ik][0];
    if (it === 'string') return { t: 'array', of: { t: 'string' } };
    if (it === 'number') return { t: 'array', of: { t: INT_ARRAY_KEYS.has(key) && items.every(Number.isInteger) ? 'int' : 'double' } };
    if (it === 'object') { const name = CLASS_OF[pathKey] || cls + pascal(key); learn(name, items); return { t: 'array', of: { t: 'class', name } }; }
    throw new Error('array of ' + it + ' at ' + pathKey);
  }
  if (k === 'object') { const name = CLASS_OF[pathKey] || cls + pascal(key); learn(name, nonNull); return { t: 'class', name }; }
  if (k === 'function') return null;
  throw new Error('unknown kind ' + k + ' at ' + pathKey);
}
function pascal(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function learn(name, objs) {
  if (!classes.has(name)) classes.set(name, new Map());
  const fields = classes.get(name);
  const keys = [];
  for (const o of objs) for (const kk of Object.keys(o)) if (!keys.includes(kk)) keys.push(kk);
  for (const kk of keys) {
    const vals = objs.map(o => o[kk]);
    const prev = fields.get(kk);
    const t = typeOf(name, kk, vals.concat(prev && prev.samples ? prev.samples : []));
    if (!t) continue;
    t.samples = vals.concat(prev && prev.samples ? prev.samples : []).filter(v => v !== undefined);
    fields.set(kk, t);
  }
}
function cs(t) {
  switch (t.t) {
    case 'string': return 'string';
    case 'bool': return 'bool';
    case 'int': return t.nullable ? 'int?' : 'int';
    case 'double': return t.nullable ? 'double?' : 'double';
    case 'class': return t.name;
    case 'array': return cs(t.of) + '[]';
    case 'dict': return 'Dictionary<string, ' + t.of + '>';
  }
  throw new Error('cs ' + JSON.stringify(t));
}
function lit(t, v, ind) {
  if (v === null || v === undefined) return 'null';
  switch (t.t) {
    case 'string': return JSON.stringify(String(v));
    case 'bool': return v ? 'true' : 'false';
    case 'int': return String(v);
    case 'double': return num(v);
    case 'array': return 'new ' + cs(t.of) + '[] { ' + v.map(x => lit(t.of, x, ind + '  ')).join(', ') + ' }';
    case 'dict': return 'new Dictionary<string, ' + t.of + '> { ' + Object.entries(v).map(([k, x]) => '[' + JSON.stringify(k) + '] = ' + (t.of === 'int' ? String(x) : num(x))).join(', ') + ' }';
    case 'class': return obj(t.name, v, ind);
  }
}
function num(v) { const s = String(v); return /[.eE]/.test(s) ? s : s + '.0'; }
function obj(name, v, ind) {
  const fields = classes.get(name);
  const parts = [];
  for (const [k, t] of fields) { if (v[k] === undefined || v[k] === null) continue; parts.push(id(k) + ' = ' + lit(t, v[k], ind + '  ')); }
  return 'new ' + name + ' { ' + parts.join(', ') + ' }';
}

// learn
const data = {};
for (const [name, kind, cls] of TABLES) {
  const v = env.get(name); data[name] = v;
  if (kind === 'dict') learn(cls, Object.values(v));
  else if (kind === 'list') learn(cls, v);
  else if (kind === 'dictlist') learn(cls, Object.values(v).flat());
  else if (kind === 'object') learn(cls, [v]);
}
let s = '// <auto-generated> by DeadZone3D/Tools/gen_data.mjs from deadzone/src/0*_data_*.js. Do not edit by hand.\n';
s += '// Field names follow the JSON keys of the HTML version (camelCase) so both versions stay in sync.\n';
s += 'using System.Collections.Generic;\n\nnamespace DeadZone.Core.Data\n{\n';
for (const [name, fields] of classes) {
  s += '    public sealed class ' + name + '\n    {\n';
  for (const [k, t] of fields) s += '        public ' + cs(t) + ' ' + id(k) + ';\n';
  s += '    }\n\n';
}
s += '    public static partial class DataTables\n    {\n';
for (const [name, kind, cls] of TABLES) {
  const v = data[name];
  if (kind === 'dict') {
    s += '        public static readonly Dictionary<string, ' + cls + '> ' + name + ' = new Dictionary<string, ' + cls + '>\n        {\n';
    for (const [k, x] of Object.entries(v)) s += '            [' + JSON.stringify(k) + '] = ' + obj(cls, x, '') + ',\n';
    s += '        };\n\n';
  } else if (kind === 'list') {
    s += '        public static readonly ' + cls + '[] ' + name + ' =\n        {\n';
    for (const x of v) s += '            ' + obj(cls, x, '') + ',\n';
    s += '        };\n\n';
  } else if (kind === 'dictlist') {
    s += '        public static readonly Dictionary<string, ' + cls + '[]> ' + name + ' = new Dictionary<string, ' + cls + '[]>\n        {\n';
    for (const [k, list] of Object.entries(v)) s += '            [' + JSON.stringify(k) + '] = new ' + cls + '[]\n            {\n' + list.map(x => '                ' + obj(cls, x, '') + ',\n').join('') + '            },\n';
    s += '        };\n\n';
  } else if (kind === 'object') {
    s += '        public static readonly ' + cls + ' ' + name + ' = ' + obj(cls, v, '') + ';\n\n';
  } else if (kind === 'strdict') {
    s += '        public static readonly Dictionary<string, string> ' + name + ' = new Dictionary<string, string>\n        {\n';
    for (const [k, x] of Object.entries(v)) s += '            [' + JSON.stringify(k) + '] = ' + JSON.stringify(x) + ',\n';
    s += '        };\n\n';
  } else if (kind === 'strlist') {
    s += '        public static readonly string[] ' + name + ' = { ' + v.map(x => JSON.stringify(x)).join(', ') + ' };\n\n';
  }
}
s += '        public const string MISSION_FAIL_TEXT = ' + JSON.stringify(env.get('MISSION_FAIL_TEXT')) + ';\n';
s += '    }\n}\n';
fs.writeFileSync(out, s);
console.log('wrote', out, s.length, 'bytes,', classes.size, 'classes');
for (const [name, fields] of classes) console.log(name + ': ' + [...fields].map(([k, t]) => k + ':' + cs(t)).join(', '));
