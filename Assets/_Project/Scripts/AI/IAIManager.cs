namespace Aetherfall.AI
{
    /// <summary>
    /// Central AI tick (architecture 11.10 "Tick zentral im AIManager (ITickable), keine Update() je Gegner"): agents register
    /// while enabled and are ticked once per frame by the TickRunner. TODO (streaming step): AI LOD (full &lt; 60 m, reduced
    /// 60–150 m, frozen beyond) and time slicing of the perception.
    /// </summary>
    public interface IAIManager
    {
        /// <summary>Number of registered agents.</summary>
        int AgentCount { get; }

        /// <summary>Adds an agent (OnEnable).</summary>
        /// <param name="agent">Agent.</param>
        void Register(IAIAgent agent);

        /// <summary>Removes an agent (OnDisable); safe during a tick.</summary>
        /// <param name="agent">Agent.</param>
        void Unregister(IAIAgent agent);
    }
}
