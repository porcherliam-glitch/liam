namespace Aetherfall.World.Puzzles
{
    /// <summary>
    /// Whether a door is open (pure logic, tested): an explicit state of the door id itself (quest action "Tuer(id, auf)",
    /// <see cref="WorldObjectStates.Done"/> = open, <see cref="WorldObjectStates.Closed"/> = closed) wins; otherwise the
    /// trigger decides: puzzle solved, object state reached, lever on, plate pressed, boss beaten – or, for the arena gate,
    /// open unless the boss fight runs (always open once the boss is beaten). "Starts open" keeps a door open from the start.
    /// </summary>
    public static class WorldDoorRules
    {
        /// <summary>Evaluates the rule.</summary>
        /// <param name="kind">Trigger kind.</param>
        /// <param name="triggerState">Stored state of the trigger id (puzzle, object, lever, plate, boss).</param>
        /// <param name="requiredState">State that opens the door for <see cref="DoorTriggerKind.ObjectState"/>.</param>
        /// <param name="startsOpen">True if the door is open in a new game.</param>
        /// <param name="ownState">Stored state of the door id itself (0 = no override).</param>
        /// <param name="encounterRunning">True while the boss fight of an arena gate runs.</param>
        /// <returns>True if the door is open.</returns>
        public static bool IsOpen(DoorTriggerKind kind, int triggerState, int requiredState, bool startsOpen, int ownState, bool encounterRunning)
        {
            if (ownState == WorldObjectStates.Done)
            {
                return true;
            }

            if (ownState == WorldObjectStates.Closed)
            {
                return false;
            }

            switch (kind)
            {
                case DoorTriggerKind.PuzzleSolved:
                case DoorTriggerKind.Lever:
                case DoorTriggerKind.PressurePlate:
                case DoorTriggerKind.BossDefeated:
                    return startsOpen || triggerState == WorldObjectStates.Done;
                case DoorTriggerKind.ObjectState:
                    return startsOpen || triggerState == requiredState;
                case DoorTriggerKind.BossArena:
                    return triggerState == WorldObjectStates.Done || !encounterRunning;
                default:
                    return startsOpen;
            }
        }
    }
}
