namespace Aetherfall.Data
{
    /// <summary>
    /// An asset that owns a content id without being a <see cref="GameDefinition"/> (yet), e.g. the enemy types of
    /// <c>Aetherfall.AI</c> (<c>enemy.wolf.grauwolf</c>). Validators count these ids as existing content, so quest data that
    /// names them is not reported as "nicht gefunden" (GDD 02 10.2 V04).
    /// </summary>
    /// <remarks>TODO (content database step): enemy types become GameDefinitions in the content catalog; then this interface can go.</remarks>
    public interface IContentIdProvider
    {
        /// <summary>The content id (empty if not set).</summary>
        string ContentId { get; }
    }
}
