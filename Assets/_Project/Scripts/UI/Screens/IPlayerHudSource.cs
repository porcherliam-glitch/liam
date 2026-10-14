using Aetherfall.Stats;

namespace Aetherfall.UI.Screens
{
    /// <summary>
    /// What the HUD and the death screen need from the player character in the gameplay scene (implemented by
    /// <see cref="PlayerHudLink"/> on the player). The UI lives in the boot scene, so it cannot reference the player directly.
    /// </summary>
    public interface IPlayerHudSource
    {
        /// <summary>Health pool.</summary>
        ResourcePool Health { get; }

        /// <summary>Stamina pool (null if the player has none).</summary>
        ResourcePool Stamina { get; }

        /// <summary>Mana pool (null if the player has none).</summary>
        ResourcePool Mana { get; }

        /// <summary>True while the player is dead.</summary>
        bool IsDead { get; }

        /// <summary>Prompt of the current interaction target, e.g. "Aufheben: Wolfsfell"; empty if none.</summary>
        string InteractionPrompt { get; }

        /// <summary>Yaw of the camera in degrees (compass heading).</summary>
        float CameraYaw { get; }

        /// <summary>True if the player can be respawned at the spawn point.</summary>
        bool CanRespawn { get; }

        /// <summary>Returns the locked-on target.</summary>
        /// <param name="target">Target info.</param>
        /// <returns>False if no living target is locked on.</returns>
        bool TryGetTarget(out HudTargetInfo target);

        /// <summary>Returns the learned ability on a slot of the first bar.</summary>
        /// <param name="slot">Slot 0–3 (keys 1–4).</param>
        /// <param name="ability">Ability info.</param>
        /// <returns>False if the slot is empty or the ability is not learned yet.</returns>
        bool TryGetAbility(int slot, out HudAbilityInfo ability);

        /// <summary>Returns the ranged stance (bow drawn).</summary>
        /// <param name="ranged">Aim, draw and arrows.</param>
        /// <returns>False outside the ranged stance.</returns>
        bool TryGetRanged(out HudRangedInfo ranged);

        /// <summary>Respawns the player at the spawn point (death screen).</summary>
        void Respawn();

        /// <summary>Switches the automatic respawn after death on or off (off while the death screen is available).</summary>
        /// <param name="enabled">True = respawn automatically after a delay.</param>
        void SetAutoRespawn(bool enabled);
    }
}
