/**
 * gore.ts — blood and dismemberment.
 * CONTRACT (used by raid.ts, enemies.ts, zombies.ts):
 *  - new GoreSystem(scene, collision, level). level "off" = no blood at all, "normal" = blood sprays, small decals and
 *    pools but no dismemberment, "brutal" = everything (default).
 *  - wound(point, dir, damage, opts): bullet/blade wound — spray along dir (exit side) and back-spatter; blood decals
 *    on walls/floor behind the target found with collision raycasts; amount scales with damage.
 *  - sever(part, impulse, opts): detach a body part — the part's world transform is copied into a physics gib (clone
 *    sharing geometry/materials), the original part group is hidden, a pulsing blood fountain starts at the joint
 *    (the part's local origin) for ~2.5 s and leaves a trail. No-op unless level === "brutal".
 *  - headshot(head, dir, opts): the head bursts — hide the head, skull/brain chunks + red mist + spatter in dir.
 *    "normal": only a heavy spray, the head stays.
 *  - gib(root, center, force, opts): the whole body breaks into chunks (explosions, point-blank heavy hits).
 *    "normal": heavy spray only.
 *  - pool(position, size, opts): a blood pool growing under a corpse over a few seconds (max ~1.2 m × size).
 *  - onScreenSplatter: set by the raid; called with 0..1 when gore happens within ~3 m of the camera.
 *  - update(dt, camera): simulate particles and gibs; clear(): remove everything (new raid); dispose().
 *  - Budgets: ≤ 1500 particles, ≤ 80 gibs, ≤ 200 decals/pools (oldest recycled). No allocations per frame.
 * PLACEHOLDER: the gore pass replaces this with the full implementation.
 */
import type * as THREE from "three"
import type { CollisionWorld } from "./collision"
import type { Vec3 } from "./types"

export type GoreLevel = "off" | "normal" | "brutal"
export interface GoreOptions { color?: number; heavy?: boolean }

export class GoreSystem {
  onScreenSplatter: ((amount: number) => void) | null = null

  constructor(readonly scene: THREE.Scene, readonly collision: CollisionWorld, public level: GoreLevel = "brutal") {}

  wound(_point: Vec3, _dir: Vec3, _damage: number, _opts: GoreOptions = {}): void { /* placeholder */ }
  sever(part: THREE.Object3D, _impulse: Vec3, _opts: GoreOptions = {}): void { if (this.level === "brutal") part.visible = false }
  headshot(head: THREE.Object3D, _dir: Vec3, _opts: GoreOptions = {}): void { if (this.level === "brutal") head.visible = false }
  gib(root: THREE.Object3D, _center: Vec3, _force: number, _opts: GoreOptions = {}): void { if (this.level === "brutal") root.visible = false }
  pool(_position: Vec3, _size: number, _opts: GoreOptions = {}): void { /* placeholder */ }
  update(_dt: number, _camera: THREE.Camera): void { /* placeholder */ }
  clear(): void { /* placeholder */ }
  dispose(): void { /* placeholder */ }
}
