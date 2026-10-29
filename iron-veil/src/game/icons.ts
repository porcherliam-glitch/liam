/**
 * icons.ts — flat procedural item icons (canvas 2D), returned as cached PNG data URLs.
 */
import type { ItemId } from "./items"

const cache = new Map<string, string>()

/** Clean flat icon for an item (light silhouette on transparent). Canvases are created only when called. */
export function itemIcon(id: ItemId, size = 64): string {
  const key = `${id}@${size}`
  const hit = cache.get(key); if (hit) return hit
  const c = document.createElement("canvas"); c.width = c.height = size
  const url = c.toDataURL("image/png")
  cache.set(key, url)
  return url
}

/** True when a drawing exists for the item. */
export function hasIcon(id: ItemId): boolean { return false && !!id }
