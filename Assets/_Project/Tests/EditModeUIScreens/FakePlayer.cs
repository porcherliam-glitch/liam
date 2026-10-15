using System;
using System.Collections.Generic;
using System.Threading;
using Aetherfall.Core;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using UnityEngine;

namespace Aetherfall.Tests.EditMode.UIScreens
{
    /// <summary><see cref="IPlayerHudSource"/> test double.</summary>
    public sealed class FakePlayer : IPlayerHudSource
    {
        /// <summary>Respawn calls.</summary>
        public int Respawns { get; private set; }

        /// <summary>Last value passed to SetAutoRespawn.</summary>
        public bool? AutoRespawn { get; private set; }

        /// <inheritdoc />
        public ResourcePool Health => null;

        /// <inheritdoc />
        public ResourcePool Stamina => null;

        /// <inheritdoc />
        public ResourcePool Mana => null;

        /// <inheritdoc />
        public bool IsDead { get; set; }

        /// <inheritdoc />
        public string InteractionPrompt => string.Empty;

        /// <inheritdoc />
        public float CameraYaw => 0f;

        /// <inheritdoc />
        public bool CanRespawn => true;

        /// <inheritdoc />
        public string StatusText => string.Empty;

        /// <inheritdoc />
        public bool TryGetTarget(out HudTargetInfo target)
        {
            target = default;
            return false;
        }

        /// <inheritdoc />
        public int ActiveAbilityBar => 0;

        /// <inheritdoc />
        public bool TryGetAbility(int slot, out HudAbilityInfo ability)
        {
            ability = default;
            return false;
        }

        /// <inheritdoc />
        public bool TryGetRanged(out HudRangedInfo ranged)
        {
            ranged = default;
            return false;
        }

        /// <inheritdoc />
        public void Respawn()
        {
            Respawns++;
            IsDead = false;
        }

        /// <inheritdoc />
        public void SetAutoRespawn(bool enabled)
        {
            AutoRespawn = enabled;
        }
    }
}
