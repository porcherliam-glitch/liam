// Sliding-window budget for automatic daemon restarts (UI-SPEC §5: at most 3 attempts per 5 minutes).
// Key decision: pure and clock-injected so the supervisor tests can drive it deterministically. Manual restarts
// ("Dienst neu starten") reset the budget; they are never limited.

export class RestartBudget {
  private stamps: number[] = [];

  constructor(
    readonly max = 3,
    readonly windowMs = 5 * 60_000,
  ) {}

  /** Records an attempt and returns true when it is within the budget; false = limit reached (nothing recorded). */
  tryConsume(now: number): boolean {
    this.prune(now);
    if (this.stamps.length >= this.max) return false;
    this.stamps.push(now);
    return true;
  }

  /** Attempts still allowed at `now`. */
  remaining(now: number): number {
    this.prune(now);
    return Math.max(0, this.max - this.stamps.length);
  }

  reset(): void {
    this.stamps = [];
  }

  private prune(now: number): void {
    this.stamps = this.stamps.filter((t) => now - t < this.windowMs);
  }
}
