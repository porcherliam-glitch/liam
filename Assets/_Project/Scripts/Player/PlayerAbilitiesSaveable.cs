using System;
using Aetherfall.SaveSystem;

namespace Aetherfall.Player
{
    /// <summary>
    /// Saves and restores the ability bar and the learned abilities of the player (section <c>abilities.player</c>, load order
    /// 46, after the resources). A new game (data null) empties the bar; the caster then places what the class or the flags
    /// grant.
    /// </summary>
    public sealed class PlayerAbilitiesSaveable : Saveable<PlayerAbilitiesDto>
    {
        /// <summary>Save key.</summary>
        public const string Key = "abilities.player";

        /// <summary>Load order.</summary>
        public const int Order = 46;

        private readonly PlayerAbilityCaster _caster;

        /// <summary>Creates the saveable.</summary>
        /// <param name="caster">Ability caster of the player.</param>
        public PlayerAbilitiesSaveable(PlayerAbilityCaster caster) : base(Key, Order)
        {
            _caster = caster != null ? caster : throw new ArgumentNullException(nameof(caster));
        }

        /// <inheritdoc />
        protected override PlayerAbilitiesDto Capture()
        {
            return _caster.CaptureState();
        }

        /// <inheritdoc />
        protected override void Restore(PlayerAbilitiesDto data, in LoadContext ctx)
        {
            _caster.RestoreState(data);
        }
    }
}
