using System;
using Aetherfall.Combat;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;

namespace Aetherfall.Player
{
    /// <summary>
    /// Saves and restores the current health, stamina and mana of the player (section <c>stats.player</c>, load order 45,
    /// architecture 9.2: "Daten aus Stats/Combat, gespeichert vom Player-Saveable").
    /// </summary>
    /// <remarks>
    /// A new game (data null) fills all pools. A loaded game never starts dead: health is restored to at least 1
    /// (saving while dead is not possible in normal play; this protects against broken files).
    /// </remarks>
    public sealed class PlayerResourcesSaveable : Saveable<PlayerResourcesDto>
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "stats.player";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 45;

        private readonly Health _health;
        private readonly ResourcePool _stamina;
        private readonly ResourcePool _mana;

        /// <summary>Creates the saveable.</summary>
        /// <param name="health">Health of the player.</param>
        /// <param name="stamina">Stamina pool (null = not saved).</param>
        /// <param name="mana">Mana pool (null = not saved).</param>
        public PlayerResourcesSaveable(Health health, ResourcePool stamina, ResourcePool mana) : base(Key, Order)
        {
            _health = health ?? throw new ArgumentNullException(nameof(health));
            _stamina = stamina;
            _mana = mana;
        }

        /// <inheritdoc />
        protected override PlayerResourcesDto Capture()
        {
            return new PlayerResourcesDto
            {
                Health = _health.Current,
                Stamina = _stamina != null ? _stamina.Current : 0f,
                Mana = _mana != null ? _mana.Current : 0f
            };
        }

        /// <inheritdoc />
        protected override void Restore(PlayerResourcesDto data, in LoadContext ctx)
        {
            if (data == null)
            {
                _health.RestoreState(_health.Max);
                if (_stamina != null)
                {
                    _stamina.Refill();
                }

                if (_mana != null)
                {
                    _mana.Refill();
                }

                return;
            }

            _health.RestoreState(Math.Max(1f, data.Health));
            if (_stamina != null)
            {
                _stamina.SetCurrent(data.Stamina);
            }

            if (_mana != null)
            {
                _mana.SetCurrent(data.Mana);
            }
        }
    }
}
