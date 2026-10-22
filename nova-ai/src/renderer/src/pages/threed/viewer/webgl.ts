// WebGL availability check for the 3D preview (kept separate from three.js so the check never loads the library).

let cached: boolean | null = null;

/** True when this window can create a WebGL context (WebGL 2 preferred). Cached per session. */
export function isWebGLAvailable(): boolean {
  if (cached !== null) return cached;
  cached = probe();
  return cached;
}

function probe(): boolean {
  // jsdom and very old engines have no WebGL constructors at all (avoids a "not implemented" getContext call).
  if (typeof WebGLRenderingContext === 'undefined' && typeof WebGL2RenderingContext === 'undefined') return false;
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/** Forgets the cached result (tests, or after the GPU process was restarted). */
export function resetWebGLCheck(): void {
  cached = null;
}
