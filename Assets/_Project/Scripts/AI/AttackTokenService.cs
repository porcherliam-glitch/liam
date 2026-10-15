using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.AI
{
    /// <summary>
    /// Default <see cref="IAttackTokenService"/> (architecture 11.10 "Token-Manager", GDD 03 9.3) as pure C# service:
    /// budgets per target and kind, token costs, re-acquire delay per enemy (1.0 s) and the minimum interval between two
    /// attack starts on the same target (0.6 s; checked for the grant and again for the start itself, see
    /// <see cref="TryBeginAttack"/>). A single enemy whose cost exceeds the budget (champion: 3) may take it while nobody
    /// else holds tokens. Registered by <see cref="AIInstaller"/>; ticked by the TickRunner.
    /// </summary>
    public sealed class AttackTokenService : IAttackTokenService, ITickable
    {
        private readonly List<TargetTokens> _targets = new List<TargetTokens>(2);
        private readonly List<string> _cooldownAgents = new List<string>(8);
        private readonly List<float> _cooldownRemaining = new List<float>(8);
        private readonly int[] _budget = new int[2];
        private float _clock;

        /// <summary>Creates the service.</summary>
        /// <param name="meleeBudget">Melee tokens per target (Normal 2; Story 1, Hard 3, Nightmare 3).</param>
        /// <param name="rangedBudget">Ranged tokens per target (Normal 2).</param>
        /// <param name="reacquireDelay">Seconds before an enemy may take a token again after giving one back (1.0).</param>
        /// <param name="minStartInterval">Seconds between two grants and between two attack starts on the same target (0.6).</param>
        public AttackTokenService(int meleeBudget = 2, int rangedBudget = 2, float reacquireDelay = 1.0f, float minStartInterval = 0.6f)
        {
            _budget[(int)TokenKind.Melee] = Math.Max(0, meleeBudget);
            _budget[(int)TokenKind.Ranged] = Math.Max(0, rangedBudget);
            ReacquireDelay = Math.Max(0f, reacquireDelay);
            MinStartInterval = Math.Max(0f, minStartInterval);
        }

        /// <summary>Delay before the same enemy may take a token again (GDD 03 9.3: 1.0 s).</summary>
        public float ReacquireDelay { get; set; }

        /// <summary>Minimum time between two attack starts on the same target (GDD 03 9.3: 0.6 s).</summary>
        public float MinStartInterval { get; set; }

        /// <summary>Sets the token budgets (GDD 03 9.7: the difficulty decides how many enemies attack at once).</summary>
        /// <param name="meleeBudget">Melee tokens per target.</param>
        /// <param name="rangedBudget">Ranged tokens per target.</param>
        public void SetBudgets(int meleeBudget, int rangedBudget)
        {
            _budget[(int)TokenKind.Melee] = Math.Max(0, meleeBudget);
            _budget[(int)TokenKind.Ranged] = Math.Max(0, rangedBudget);
        }

        /// <summary>Budget of a kind per target.</summary>
        /// <param name="kind">Kind.</param>
        public int BudgetOf(TokenKind kind)
        {
            return _budget[(int)kind];
        }

        /// <summary>Changes a budget (difficulty, GDD 03 9.7).</summary>
        /// <param name="kind">Kind.</param>
        /// <param name="budget">New budget.</param>
        public void SetBudget(TokenKind kind, int budget)
        {
            _budget[(int)kind] = Math.Max(0, budget);
        }

        /// <inheritdoc />
        public bool TryAcquire(string targetId, string agentId, int cost, TokenKind kind = TokenKind.Melee)
        {
            if (string.IsNullOrEmpty(targetId) || string.IsNullOrEmpty(agentId))
            {
                return false;
            }

            TargetTokens target = GetOrCreate(targetId);
            if (target.IndexOf(agentId) >= 0)
            {
                return true;
            }

            if (CooldownOf(agentId) > 0f || _clock - target.LastGrantTime < MinStartInterval)
            {
                return false;
            }

            int amount = Math.Max(1, cost);
            int used = target.Used[(int)kind];
            int budget = _budget[(int)kind];
            bool fits = used + amount <= budget || (used == 0 && budget > 0);
            if (!fits)
            {
                return false;
            }

            target.Holders.Add(new Holder(agentId, amount, kind));
            target.Used[(int)kind] = used + amount;
            target.LastGrantTime = _clock;
            return true;
        }

        /// <inheritdoc />
        public bool TryBeginAttack(string targetId, string agentId)
        {
            TargetTokens target = Find(targetId);
            if (target == null || target.IndexOf(agentId) < 0 || _clock - target.LastStartTime < MinStartInterval)
            {
                return false;
            }

            target.LastStartTime = _clock;
            return true;
        }

        /// <inheritdoc />
        public void Release(string targetId, string agentId)
        {
            TargetTokens target = Find(targetId);
            if (target == null)
            {
                return;
            }

            int index = target.IndexOf(agentId);
            if (index < 0)
            {
                return;
            }

            Holder holder = target.Holders[index];
            target.Holders.RemoveAt(index);
            target.Used[(int)holder.Kind] = Math.Max(0, target.Used[(int)holder.Kind] - holder.Cost);
            SetCooldown(agentId, ReacquireDelay);
        }

        /// <inheritdoc />
        public int Available(string targetId, TokenKind kind)
        {
            TargetTokens target = Find(targetId);
            int used = target != null ? target.Used[(int)kind] : 0;
            return Math.Max(0, _budget[(int)kind] - used);
        }

        /// <inheritdoc />
        public bool Holds(string targetId, string agentId)
        {
            TargetTokens target = Find(targetId);
            return target != null && target.IndexOf(agentId) >= 0;
        }

        /// <summary>Number of enemies holding tokens on a target.</summary>
        /// <param name="targetId">Id of the target.</param>
        public int HolderCount(string targetId)
        {
            TargetTokens target = Find(targetId);
            return target != null ? target.Holders.Count : 0;
        }

        /// <inheritdoc />
        public void Tick(float deltaTime)
        {
            if (!(deltaTime > 0f))
            {
                return;
            }

            _clock += deltaTime;
            for (int i = _cooldownRemaining.Count - 1; i >= 0; i--)
            {
                float remaining = _cooldownRemaining[i] - deltaTime;
                if (remaining <= 0f)
                {
                    _cooldownRemaining.RemoveAt(i);
                    _cooldownAgents.RemoveAt(i);
                }
                else
                {
                    _cooldownRemaining[i] = remaining;
                }
            }
        }

        private float CooldownOf(string agentId)
        {
            int index = _cooldownAgents.IndexOf(agentId);
            return index >= 0 ? _cooldownRemaining[index] : 0f;
        }

        private void SetCooldown(string agentId, float seconds)
        {
            if (!(seconds > 0f))
            {
                return;
            }

            int index = _cooldownAgents.IndexOf(agentId);
            if (index >= 0)
            {
                _cooldownRemaining[index] = seconds;
                return;
            }

            _cooldownAgents.Add(agentId);
            _cooldownRemaining.Add(seconds);
        }

        private TargetTokens Find(string targetId)
        {
            for (int i = 0; i < _targets.Count; i++)
            {
                if (string.Equals(_targets[i].TargetId, targetId, StringComparison.Ordinal))
                {
                    return _targets[i];
                }
            }

            return null;
        }

        private TargetTokens GetOrCreate(string targetId)
        {
            TargetTokens target = Find(targetId);
            if (target == null)
            {
                target = new TargetTokens(targetId);
                _targets.Add(target);
            }

            return target;
        }

        private readonly struct Holder
        {
            public readonly string AgentId;
            public readonly int Cost;
            public readonly TokenKind Kind;

            public Holder(string agentId, int cost, TokenKind kind)
            {
                AgentId = agentId;
                Cost = cost;
                Kind = kind;
            }
        }

        private sealed class TargetTokens
        {
            public readonly string TargetId;
            public readonly List<Holder> Holders = new List<Holder>(4);
            public readonly int[] Used = new int[2];
            public float LastGrantTime = float.NegativeInfinity;
            public float LastStartTime = float.NegativeInfinity;

            public TargetTokens(string targetId)
            {
                TargetId = targetId;
            }

            public int IndexOf(string agentId)
            {
                for (int i = 0; i < Holders.Count; i++)
                {
                    if (string.Equals(Holders[i].AgentId, agentId, StringComparison.Ordinal))
                    {
                        return i;
                    }
                }

                return -1;
            }
        }
    }
}
