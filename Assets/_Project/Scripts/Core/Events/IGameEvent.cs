namespace Aetherfall.Core
{
    /// <summary>
    /// Marker interface for global events sent over <see cref="IEventBus"/> (architecture 4.3).
    /// </summary>
    /// <remarks>
    /// Rules for event types: <c>readonly struct</c>; past tense, English, a fact instead of a command
    /// (<c>EnemyKilled</c>, not <c>KillEnemy</c>); payload only IDs (string), numbers, enums and <c>Vector3</c>;
    /// no references to <c>UnityEngine.Object</c>; at most 64 bytes.
    /// </remarks>
    public interface IGameEvent
    {
    }
}
