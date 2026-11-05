// Minimal typed event bus. Systems talk through events instead of direct references.

export type EventMap = {
  noise: { x: number; z: number; radius: number; source: "player" | "world" }
  playerDamaged: { amount: number; hp: number; source: string }
  playerDied: { cause: string }
  enemyKilled: { typeId: string; x: number; z: number; boss: boolean; special?: string }
  enemyHit: { typeId: string; damage: number; crit: boolean; x: number; y: number; z: number }
  itemPickedUp: { itemId: string; qty: number; name: string; rarity: string }
  containerOpened: { kind: string; x: number; z: number }
  extractionActivated: { id: string; name: string }
  extracted: { id: string; name: string }
  missionProgress: { missionId: string; progress: number; goal: number; done: boolean }
  areaVisited: { pointId: string }
  survivorRescued: { survivorId: string }
  toast: { text: string; kind?: "info" | "loot" | "warn" | "good" }
  levelUp: { level: number }
  weatherChanged: { weather: string }
  weaponBroke: { name: string }
  questItemFound: { itemId: string }
}

type Handler<T> = (payload: T) => void

export class EventBus {
  private handlers = new Map<keyof EventMap, Set<Handler<unknown>>>()

  on<K extends keyof EventMap>(name: K, handler: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(name)
    if (!set) {
      set = new Set()
      this.handlers.set(name, set)
    }
    set.add(handler as Handler<unknown>)
    return () => set!.delete(handler as Handler<unknown>)
  }

  emit<K extends keyof EventMap>(name: K, payload: EventMap[K]): void {
    const set = this.handlers.get(name)
    if (!set) return
    for (const h of [...set]) h(payload)
  }

  clear(): void {
    this.handlers.clear()
  }
}

export const events = new EventBus()
