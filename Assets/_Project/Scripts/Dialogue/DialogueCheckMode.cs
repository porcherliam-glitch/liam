namespace Aetherfall.Dialogue
{
    /// <summary>
    /// How skill checks are decided (GDD 02, 12.3, open decision). <see cref="Deterministic"/> is the recommendation and the
    /// default; the data supports both because every check node has a success and an optional failure exit.
    /// </summary>
    public enum DialogueCheckMode
    {
        /// <summary>Value at least threshold (recommended): locked options stay visible with threshold and own value.</summary>
        Deterministic = 0,

        /// <summary>
        /// D20 plus bonus at least threshold (BG3 style): the option shows the chance; the roll is fixed per NPC, game day and
        /// node (no reload trick).
        /// </summary>
        Dice = 1
    }
}
