using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.AI
{
    /// <summary>
    /// Default <see cref="IAIManager"/>: ticks all registered agents once per frame (registered as <see cref="ITickable"/>
    /// service by <see cref="AIInstaller"/>). Agents may register or unregister during a tick (e.g. a dying enemy disables
    /// itself); the change applies from the next frame. An agent that throws is logged once and skipped afterwards.
    /// </summary>
    public sealed class AIManager : IAIManager, ITickable
    {
        private readonly List<IAIAgent> _agents = new List<IAIAgent>(32);
        private readonly List<IAIAgent> _faulted = new List<IAIAgent>(2);
        private IAIAgent[] _snapshot = Array.Empty<IAIAgent>();
        private bool _dirty;

        /// <inheritdoc />
        public int AgentCount => _agents.Count;

        /// <inheritdoc />
        public void Register(IAIAgent agent)
        {
            if (agent != null && !_agents.Contains(agent))
            {
                _agents.Add(agent);
                _dirty = true;
            }
        }

        /// <inheritdoc />
        public void Unregister(IAIAgent agent)
        {
            if (_agents.Remove(agent))
            {
                _dirty = true;
            }
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (_dirty)
            {
                // Allocation only when the set of agents changed.
                _snapshot = _agents.ToArray();
                _dirty = false;
            }

            IAIAgent[] agents = _snapshot;
            for (int i = 0; i < agents.Length; i++)
            {
                IAIAgent agent = agents[i];
                if (!_agents.Contains(agent) || _faulted.Contains(agent))
                {
                    continue;
                }

                try
                {
                    agent.TickAI(deltaTime);
                }
                catch (Exception exception)
                {
                    _faulted.Add(agent);
                    Log.Exception(LogCategory.AI, exception, "AI agent " + agent.GetType().Name + " threw and is not ticked again in this session.");
                }
            }
        }
    }
}
