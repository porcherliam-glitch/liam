// Monaco language id guess by file name / extension (FileContent.language). Only ids Monaco actually ships are used;
// unknown types fall back to "plaintext". Engine formats are mapped to the closest highlighter (Unity scene/asset files
// are YAML, Godot scenes are INI-like, GDScript is close to Python).

const BY_NAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  makefile: 'plaintext',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.env': 'ini',
  'cmakelists.txt': 'plaintext',
};

const BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  json: 'json', jsonc: 'json', json5: 'json', asmdef: 'json', asmref: 'json', uproject: 'json', uplugin: 'json',
  md: 'markdown', markdown: 'markdown', mdx: 'mdx',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html',
  css: 'css', scss: 'scss', sass: 'scss', less: 'less',
  py: 'python', pyw: 'python', gd: 'python',
  cs: 'csharp', csx: 'csharp',
  vb: 'vb', fs: 'fsharp', fsx: 'fsharp',
  xml: 'xml', xaml: 'xml', csproj: 'xml', vbproj: 'xml', fsproj: 'xml', props: 'xml', targets: 'xml', config: 'xml', sln: 'plaintext',
  resx: 'xml', svg: 'xml', plist: 'xml', manifest: 'xml', nuspec: 'xml',
  yaml: 'yaml', yml: 'yaml', unity: 'yaml', prefab: 'yaml', asset: 'yaml', meta: 'yaml', mat: 'yaml', controller: 'yaml', anim: 'yaml',
  tscn: 'ini', tres: 'ini', godot: 'ini', ini: 'ini', cfg: 'ini', toml: 'ini', properties: 'ini', env: 'ini',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  ps1: 'powershell', psm1: 'powershell', psd1: 'powershell',
  bat: 'bat', cmd: 'bat',
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'plaintext', gradle: 'plaintext',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ino: 'cpp',
  go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift', dart: 'dart', lua: 'lua', r: 'r', pl: 'perl', pm: 'perl',
  ex: 'elixir', exs: 'elixir', clj: 'clojure', coffee: 'coffee', jl: 'julia',
  sql: 'sql', graphql: 'graphql', gql: 'graphql', proto: 'protobuf', tf: 'hcl', hcl: 'hcl',
  razor: 'razor', cshtml: 'razor', hbs: 'handlebars', handlebars: 'handlebars', pug: 'pug', twig: 'twig', liquid: 'liquid',
  sol: 'solidity', wgsl: 'wgsl', sv: 'systemverilog', svh: 'systemverilog', v: 'systemverilog', tcl: 'tcl',
  txt: 'plaintext', log: 'plaintext', csv: 'plaintext',
};

export function languageForPath(path: string): string {
  const name = (path.replace(/\\/g, '/').split('/').pop() ?? '').toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith('.env.')) return 'ini';
  if (name.startsWith('dockerfile.')) return 'dockerfile';
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  return BY_EXT[name.slice(dot + 1)] ?? 'plaintext';
}
