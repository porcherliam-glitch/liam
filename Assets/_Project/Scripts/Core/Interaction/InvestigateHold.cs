namespace Aetherfall.Core
{
    /// <summary>
    /// Hold of the Investigate button (GDD 03 1.4: R3 is lock-on with a target and investigate without one): investigating
    /// starts after <see cref="InvestigateRules.HoldDelaySeconds"/> of holding, and a hold during which a lock-on target was
    /// held (the press that released or took the lock-on) never counts until the button is let go. Pure logic.
    /// </summary>
    public sealed class InvestigateHold
    {
        private float _held = -1f;
        private bool _blocked;

        /// <summary>Advances the hold and says whether it means investigating now.</summary>
        /// <param name="pressed">Button held this frame.</param>
        /// <param name="lockedOn">A lock-on target is held this frame.</param>
        /// <param name="deltaTime">Seconds since the last call.</param>
        public bool Update(bool pressed, bool lockedOn, float deltaTime)
        {
            if (!pressed)
            {
                _held = -1f;
                _blocked = false;
                return false;
            }

            _held = _held < 0f ? 0f : _held + (deltaTime > 0f ? deltaTime : 0f);
            if (lockedOn)
            {
                _blocked = true;
            }

            return !_blocked && _held >= InvestigateRules.HoldDelaySeconds;
        }
    }
}
