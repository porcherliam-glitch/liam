namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Optional for <see cref="ISaveable"/>s: called after ALL <see cref="ISaveable.Load"/> calls of a load (architecture
    /// 9.1), e.g. to reconcile counters with other systems or to publish "player placed".
    /// </summary>
    public interface IPostLoad
    {
        /// <summary>Called on the main thread after every saveable has loaded, in load order.</summary>
        /// <param name="ctx">The same context as in <see cref="ISaveable.Load"/>.</param>
        void OnAfterLoad(in LoadContext ctx);
    }
}
