using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.Stats;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Default <see cref="IProgressionService"/> (GDD 03 12, architecture 3.3 no. 14). Pure logic: event bus, curve and kill
    /// rules come in through the constructor, so level paths can be tested with artificial events.
    /// </summary>
    /// <remarks>
    /// <para><b>Experience:</b> gains go into the current level; every filled level raises the level and gives one attribute
    /// point and one skill point (§11.3). At the max level further experience is dropped (paragon follows, GDD 04). The state is
    /// changed completely before any event is sent, so receivers of <c>LevelUp</c> may add experience again.</para>
    /// <para><b>Kills:</b> the service listens to <c>EnemyKilled</c> after <see cref="PostInitialize"/> and adds
    /// <see cref="KillXpRules.Compute"/> for kills of the player, companions and summons.</para>
    /// <para><b>Stats:</b> the bound player stats get the level as base value of <see cref="StatId.Level"/> and one flat
    /// modifier per attribute with the distributed points (source <see cref="ProgressionRules.AttributeSourceId"/>).
    /// Modifiers are never saved; they are rebuilt from the loaded points (architecture 11.5).</para>
    /// <para><b>Saving:</b> <see cref="ProgressionSaveable"/> (section <c>progression</c>, load order 40) sets the state with
    /// <see cref="LoadState"/> without events.</para>
    /// </remarks>
    public sealed class ProgressionService : IProgressionService, IPostInitializable, IDisposable
    {
        private readonly IEventBus _bus;
        private readonly KillXpRules _killRules;
        private readonly int[] _spent = new int[StatIds.Capacity];
        private readonly int[] _refundable = new int[StatIds.Capacity];
        private StatCollection _stats;
        private int _level = 1;
        private int _xpIntoLevel;
        private int _unspentAttributePoints;
        private int _unspentSkillPoints;
        private int _bonusSkillPoints;
        private bool _subscribed;
        private bool _disposed;

        /// <summary>Creates the service at level 1 without experience.</summary>
        /// <param name="bus">Event bus (EnemyKilled in, XpGained and LevelUp out).</param>
        /// <param name="curve">Experience curve (null = GDD values).</param>
        /// <param name="killRules">Kill experience rules (null = GDD values).</param>
        public ProgressionService(IEventBus bus, XpCurve curve = null, KillXpRules killRules = null)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            Curve = curve ?? XpCurve.Default;
            _killRules = killRules ?? new KillXpRules();
        }

        /// <inheritdoc />
        public event Action Changed;

        /// <inheritdoc />
        public int Revision { get; private set; }

        /// <inheritdoc />
        public XpCurve Curve { get; }

        /// <summary>Kill experience rules.</summary>
        public KillXpRules KillRules => _killRules;

        /// <inheritdoc />
        public int Level => _level;

        /// <inheritdoc />
        public int MaxLevel => Curve.MaxLevel;

        /// <inheritdoc />
        public bool IsMaxLevel => _level >= Curve.MaxLevel;

        /// <inheritdoc />
        public int XpIntoLevel => _xpIntoLevel;

        /// <inheritdoc />
        public int XpForNextLevel => Curve.XpToNext(_level);

        /// <inheritdoc />
        public int TotalXp => Curve.TotalXpAt(_level) + _xpIntoLevel;

        /// <inheritdoc />
        public float LevelProgress01
        {
            get
            {
                int needed = XpForNextLevel;
                return needed <= 0 ? 1f : Math.Max(0f, Math.Min(1f, _xpIntoLevel / (float)needed));
            }
        }

        /// <inheritdoc />
        public int UnspentAttributePoints => _unspentAttributePoints;

        /// <inheritdoc />
        public int UnspentSkillPoints => _unspentSkillPoints;

        /// <summary>Skill points received from quests and secrets so far (GDD 03 12.2), part of <see cref="UnspentSkillPoints"/>.</summary>
        public int BonusSkillPoints => _bonusSkillPoints;

        /// <inheritdoc />
        public StatCollection PlayerStats => _stats;

        /// <inheritdoc />
        public int GetSpentPoints(StatId attribute)
        {
            return StatIds.IsAttribute(attribute) ? _spent[(int)attribute] : 0;
        }

        /// <inheritdoc />
        public int GetRefundablePoints(StatId attribute)
        {
            return StatIds.IsAttribute(attribute) ? _refundable[(int)attribute] : 0;
        }

        /// <summary>Subscribes to <c>EnemyKilled</c> (boot step 6).</summary>
        public void PostInitialize()
        {
            if (_subscribed || _disposed)
            {
                return;
            }

            _bus.Subscribe<EnemyKilled>(OnEnemyKilled);
            _subscribed = true;
        }

        /// <summary>Unsubscribes and unbinds the stats.</summary>
        public void Dispose()
        {
            if (_disposed)
            {
                return;
            }

            if (_subscribed)
            {
                _bus.Unsubscribe<EnemyKilled>(OnEnemyKilled);
                _subscribed = false;
            }

            if (_stats != null)
            {
                DetachPlayerStats(_stats);
            }

            _disposed = true;
        }

        /// <inheritdoc />
        public int AddXp(int amount, string sourceId)
        {
            if (amount <= 0 || IsMaxLevel)
            {
                return 0;
            }

            // More than the whole curve can never count; the cap also keeps the sum below int.MaxValue.
            amount = Math.Min(amount, Math.Max(1, Curve.TotalToMaxLevel));
            int oldLevel = _level;
            int counted = amount;
            _xpIntoLevel += amount;
            while (!IsMaxLevel && _xpIntoLevel >= XpForNextLevel)
            {
                _xpIntoLevel -= XpForNextLevel;
                _level++;
                _unspentAttributePoints += ProgressionRules.AttributePointsPerLevel;
                _unspentSkillPoints += ProgressionRules.SkillPointsPerLevel;
            }

            if (IsMaxLevel)
            {
                // GDD 03 12.1: level 80 is the end until paragon exists; the overflow does not count.
                counted -= _xpIntoLevel;
                _xpIntoLevel = 0;
            }

            int newLevel = _level;
            if (newLevel != oldLevel)
            {
                ApplyLevel();
                Log.Info(LogCategory.Player, "Level up: " + oldLevel + " -> " + newLevel + " (source '" + sourceId + "').");
            }

            MarkChanged();
            var gained = new XpGained(counted, sourceId);
            _bus.Publish(in gained);
            for (int level = oldLevel + 1; level <= newLevel; level++)
            {
                var levelUp = new LevelUp(level);
                _bus.Publish(in levelUp);
            }

            RaiseChanged();
            return counted;
        }

        /// <inheritdoc />
        public int AddXpLevelShare(float share, int referenceLevel, string sourceId)
        {
            int reference = referenceLevel > 0 ? referenceLevel : _level;
            return AddXp(Curve.LevelShareToXp(share, reference), sourceId);
        }

        /// <inheritdoc />
        public void AddSkillPoints(int amount, string sourceId)
        {
            if (amount <= 0)
            {
                return;
            }

            _unspentSkillPoints += amount;
            _bonusSkillPoints += amount;
            Log.Info(LogCategory.Player, "+" + amount + " skill point(s) from '" + sourceId + "'.");
            MarkChanged();
            RaiseChanged();
        }

        /// <inheritdoc />
        public bool CanSpendAttributePoint(StatId attribute, out string reason)
        {
            if (!StatIds.IsAttribute(attribute))
            {
                reason = "Kein Attribut.";
                return false;
            }

            if (_unspentAttributePoints <= 0)
            {
                reason = "Keine freien Attributpunkte.";
                return false;
            }

            float baseValue = _stats != null ? _stats.GetBase(attribute) : 0f;
            if (baseValue + _spent[(int)attribute] + 1 > ProgressionRules.AttributeHardCap)
            {
                reason = "Höchstwert " + ProgressionRules.AttributeHardCap + " erreicht.";
                return false;
            }

            reason = string.Empty;
            return true;
        }

        /// <inheritdoc />
        public bool TrySpendAttributePoint(StatId attribute)
        {
            if (!CanSpendAttributePoint(attribute, out _))
            {
                return false;
            }

            _unspentAttributePoints--;
            _spent[(int)attribute]++;
            _refundable[(int)attribute]++;
            ApplyAttributes();
            MarkChanged();
            RaiseChanged();
            return true;
        }

        /// <inheritdoc />
        public bool TryRefundAttributePoint(StatId attribute)
        {
            if (!StatIds.IsAttribute(attribute) || _refundable[(int)attribute] <= 0)
            {
                return false;
            }

            _refundable[(int)attribute]--;
            _spent[(int)attribute]--;
            _unspentAttributePoints++;
            ApplyAttributes();
            MarkChanged();
            RaiseChanged();
            return true;
        }

        /// <inheritdoc />
        public void LockAllocation()
        {
            bool any = false;
            for (int i = 0; i < _refundable.Length; i++)
            {
                any |= _refundable[i] != 0;
                _refundable[i] = 0;
            }

            if (any)
            {
                MarkChanged();
                RaiseChanged();
            }
        }

        /// <inheritdoc />
        public void AttachPlayerStats(StatCollection stats)
        {
            if (stats == null)
            {
                return;
            }

            if (_stats != null && !ReferenceEquals(_stats, stats))
            {
                DetachPlayerStats(_stats);
            }

            _stats = stats;
            ApplyLevel();
            ApplyAttributes();
            MarkChanged();
            RaiseChanged();
        }

        /// <inheritdoc />
        public void DetachPlayerStats(StatCollection stats)
        {
            if (stats == null || !ReferenceEquals(_stats, stats))
            {
                return;
            }

            stats.RemoveAllFromSource(ProgressionRules.AttributeSourceId);
            _stats = null;
            MarkChanged();
            RaiseChanged();
        }

        /// <summary>
        /// Load step (<see cref="ProgressionSaveable"/>): sets the state without events. Values are clamped (level 1 … max,
        /// experience below the next level, no negative points, distributed points of the six attributes only).
        /// </summary>
        /// <param name="level">Level.</param>
        /// <param name="xpIntoLevel">Experience in the level.</param>
        /// <param name="unspentAttributePoints">Free attribute points.</param>
        /// <param name="unspentSkillPoints">Free skill points.</param>
        /// <param name="bonusSkillPoints">Skill points received from quests so far.</param>
        /// <param name="spent">Distributed points per attribute (may be null).</param>
        public void LoadState(int level, int xpIntoLevel, int unspentAttributePoints, int unspentSkillPoints, int bonusSkillPoints,
            IEnumerable<KeyValuePair<StatId, int>> spent)
        {
            _level = Math.Max(1, Math.Min(Curve.MaxLevel, level));
            int needed = XpForNextLevel;
            _xpIntoLevel = needed <= 0 ? 0 : Math.Max(0, Math.Min(needed - 1, xpIntoLevel));
            _unspentAttributePoints = Math.Max(0, unspentAttributePoints);
            _unspentSkillPoints = Math.Max(0, unspentSkillPoints);
            _bonusSkillPoints = Math.Max(0, bonusSkillPoints);
            Array.Clear(_spent, 0, _spent.Length);
            Array.Clear(_refundable, 0, _refundable.Length);
            if (spent != null)
            {
                foreach (KeyValuePair<StatId, int> entry in spent)
                {
                    if (StatIds.IsAttribute(entry.Key) && entry.Value > 0)
                    {
                        _spent[(int)entry.Key] += entry.Value;
                    }
                }
            }

            ApplyLevel();
            ApplyAttributes();
            MarkChanged();
            RaiseChanged();
        }

        /// <summary>New game: level 1, no experience, no points (load step with data null).</summary>
        public void ResetToNewGame()
        {
            LoadState(1, 0, 0, 0, 0, null);
        }

        /// <summary>Distributed points per attribute (for the save), attributes with 0 points left out.</summary>
        public List<KeyValuePair<StatId, int>> CaptureSpentPoints()
        {
            var result = new List<KeyValuePair<StatId, int>>(StatIds.Attributes.Length);
            for (int i = 0; i < StatIds.Attributes.Length; i++)
            {
                StatId attribute = StatIds.Attributes[i];
                if (_spent[(int)attribute] > 0)
                {
                    result.Add(new KeyValuePair<StatId, int>(attribute, _spent[(int)attribute]));
                }
            }

            return result;
        }

        private void OnEnemyKilled(EnemyKilled evt)
        {
            if (!KillXpRules.CountsForPlayer(evt.KillerId))
            {
                return;
            }

            // TODO (time-of-day step): pass true at night (x1.25, GDD 03 12.7).
            int xp = _killRules.Compute(evt.EnemyLevel, evt.VariantId, _level, false);
            AddXp(xp, evt.EnemyTypeId);
        }

        private void ApplyLevel()
        {
            if (_stats != null)
            {
                _stats.SetBase(StatId.Level, _level);
            }
        }

        private void ApplyAttributes()
        {
            if (_stats == null)
            {
                return;
            }

            string source = ProgressionRules.AttributeSourceId;
            _stats.RemoveAllFromSource(source);
            for (int i = 0; i < StatIds.Attributes.Length; i++)
            {
                StatId attribute = StatIds.Attributes[i];
                int points = _spent[(int)attribute];
                if (points > 0)
                {
                    _stats.AddModifier(StatModifier.Flat(attribute, points, source));
                }
            }
        }

        private void MarkChanged()
        {
            Revision++;
        }

        private void RaiseChanged()
        {
            Action changed = Changed;
            if (changed != null)
            {
                changed();
            }
        }
    }
}
