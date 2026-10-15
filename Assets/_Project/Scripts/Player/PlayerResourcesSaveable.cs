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
    /// <para>The section loads before <c>inventory</c> (45 before 50), whose equipment may raise the maximum values (e.g. an
    /// affix "Vital"). The loaded values are therefore applied again in <see cref="OnAfterLoad"/>, when every modifier is back.</para>
    /// </remarks>
    public sealed class PlayerResourcesSaveable : Saveable<PlayerResourcesDto>, IPostLoad
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "stats.player";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 45;

        private readonly Health _health;
        private readonly ResourcePool _stamina;
        private readonly ResourcePool _mana;
        private readonly StatusEffectController _status;
        private PlayerResourcesDto _loaded;

        /// <summary>Creates the saveable.</summary>
        /// <param name="health">Health of the player.</param>
        /// <param name="stamina">Stamina pool (null = not saved).</param>
        /// <param name="mana">Mana pool (null = not saved).</param>
        /// <param name="status">Status effects (the corruption bar is saved; null = not saved).</param>
        public PlayerResourcesSaveable(Health health, ResourcePool stamina, ResourcePool mana, StatusEffectController status = null) : base(Key, Order)
        {
            _health = health ?? throw new ArgumentNullException(nameof(health));
            _stamina = stamina;
            _mana = mana;
            _status = status;
        }

        /// <inheritdoc />
        protected override PlayerResourcesDto Capture()
        {
            return new PlayerResourcesDto
            {
                Health = _health.Current,
                Stamina = _stamina != null ? _stamina.Current : 0f,
                Mana = _mana != null ? _mana.Current : 0f,
                Corruption = _status != null ? _status.Corruption : 0f
            };
        }

        /// <inheritdoc />
        public void OnAfterLoad(in LoadContext ctx)
        {
            PlayerResourcesDto data = _loaded;
            _loaded = null;
            if (data != null)
            {
                Apply(data);
            }
        }

        /// <inheritdoc />
        protected override void Restore(PlayerResourcesDto data, in LoadContext ctx)
        {
            _loaded = data;
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

                if (_status != null)
                {
                    _status.ClearEffects();
                    _status.SetCorruption(0f);
                }

                return;
            }

            Apply(data);
        }

        private void Apply(PlayerResourcesDto data)
        {
            _health.RestoreState(Math.Max(1f, data.Health));
            if (_status != null)
            {
                // Running effects are not saved (GDD 03 7: they are seconds long); the corruption bar stays.
                _status.ClearEffects();
                _status.SetCorruption(data.Corruption);
            }

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
