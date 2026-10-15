using System;
using System.Collections.Generic;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Player;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Skills
{
    /// <summary>
    /// Connects the skill tree with the player figure (GDD 03 11.3–11.5): stat bonuses of the learned nodes, the abilities
    /// they teach (<see cref="PlayerAbilityCaster.Learn"/>), the ability bonuses and upgrades, the warrior's combat bonuses
    /// (light attacks, heavy poise, block stability) and stamina back for combo finishers and perfect parries. It is also the
    /// ability bar of the skill page (<see cref="ISkillLoadout"/>).
    /// </summary>
    /// <remarks>GameObject: the player root (the menus "Testgelände/Eichental/Gruft erstellen" add it). Without a skill service
    /// (BootConfig without SkillInstaller) it does nothing.</remarks>
    [DisallowMultipleComponent]
    public sealed class PlayerSkills : MonoBehaviour, ISkillLoadout
    {
        [Tooltip("Fähigkeiten der Figur. Leer = PlayerAbilityCaster am selben GameObject.")]
        [SerializeField] private PlayerAbilityCaster caster = null;

        [Tooltip("Kampfsteuerung (Boni des Kriegers). Leer = PlayerCombatController am selben GameObject.")]
        [SerializeField] private PlayerCombatController combat = null;

        [Tooltip("Werte der Figur. Leer = CharacterStatsComponent am selben GameObject.")]
        [SerializeField] private CharacterStatsComponent stats = null;

        [Tooltip("Kampf-Wurzel. Leer = Combatant am selben GameObject.")]
        [SerializeField] private Combatant combatant = null;

        private readonly List<StatModifier> _applied = new List<StatModifier>();
        private ISkillService _skills;
        private ICombatService _combat;

        /// <summary>The skill service once resolved, or null.</summary>
        public ISkillService Service => _skills;

        /// <inheritdoc />
        public int SlotOf(string abilityId)
        {
            return caster != null ? caster.Bar.IndexOf(abilityId) : -1;
        }

        /// <inheritdoc />
        public bool MoveToNextSlot(string abilityId, int direction)
        {
            if (caster == null || !caster.IsLearned(abilityId))
            {
                return false;
            }

            // Positions: −1 (off the bar), 0 … 7; the other ability in the target slot swaps places.
            int count = AbilityBar.SlotCount + 1;
            int current = caster.Bar.IndexOf(abilityId) + 1;
            int next = ((current + (direction >= 0 ? 1 : -1)) % count + count) % count;
            if (next == 0)
            {
                caster.Bar.Remove(abilityId);
            }
            else
            {
                caster.Bar.Assign(next - 1, abilityId);
            }

            return true;
        }

        private void Awake()
        {
            if (caster == null)
            {
                TryGetComponent(out caster);
            }

            if (combat == null)
            {
                TryGetComponent(out combat);
            }

            if (stats == null)
            {
                TryGetComponent(out stats);
            }

            if (combatant == null)
            {
                TryGetComponent(out combatant);
            }
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10).
            try
            {
                await Services.WaitForAsync<IGameStateService>(destroyCancellationToken);
                IServiceLocator locator = Services.Locator;
                if (!locator.TryGet(out _skills))
                {
                    Log.Info(LogCategory.Player, "PlayerSkills: no skill service (SkillInstaller missing in the BootConfig) – no skill tree.");
                    return;
                }

                locator.TryGet(out _combat);
                if (_combat != null)
                {
                    _combat.HitLanded += OnHitLanded;
                }

                _skills.Loadout = this;
                _skills.Changed += Apply;
                Apply();
            }
            catch (OperationCanceledException)
            {
                // Destroyed while waiting for the boot.
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Player, exception, "PlayerSkills could not resolve its services.");
            }
        }

        private void OnDestroy()
        {
            if (_skills != null)
            {
                _skills.Changed -= Apply;
                if (ReferenceEquals(_skills.Loadout, this))
                {
                    _skills.Loadout = null;
                }
            }

            if (_combat != null)
            {
                _combat.HitLanded -= OnHitLanded;
            }

            RemoveStats();
        }

        private void Apply()
        {
            if (_skills == null)
            {
                return;
            }

            SkillBonuses bonuses = _skills.Bonuses;
            RemoveStats();
            if (stats != null && stats.Stats != null)
            {
                IReadOnlyList<StatModifier> modifiers = bonuses.Stats;
                for (int i = 0; i < modifiers.Count; i++)
                {
                    stats.Stats.AddModifier(modifiers[i]);
                    _applied.Add(modifiers[i]);
                }
            }

            if (caster != null)
            {
                caster.ApplyModifiers(bonuses.AbilityModifiers);
                foreach (string abilityId in bonuses.TreeAbilities)
                {
                    bool learned = false;
                    foreach (string taught in bonuses.Abilities)
                    {
                        if (taught == abilityId)
                        {
                            learned = true;
                            break;
                        }
                    }

                    if (learned)
                    {
                        caster.Learn(abilityId);
                    }
                    else
                    {
                        caster.Forget(abilityId);
                    }
                }
            }

            if (combat != null)
            {
                combat.LightAttackBonus = bonuses.LightAttackDamage;
                combat.HeavyPoiseBonus = bonuses.HeavyAttackPoise;
                combat.BlockStabilityBonus = bonuses.BlockStability;
            }
        }

        private void RemoveStats()
        {
            if (stats != null && stats.Stats != null)
            {
                for (int i = 0; i < _applied.Count; i++)
                {
                    stats.Stats.RemoveModifier(_applied[i]);
                }
            }

            _applied.Clear();
        }

        private void OnHitLanded(HitReport report)
        {
            if (_skills == null || stats == null || stats.Stamina == null || combatant == null)
            {
                return;
            }

            SkillBonuses bonuses = _skills.Bonuses;
            if (report.Attacker == combatant && report.Defense == DefenseOutcome.Hit && report.Attack != null &&
                report.Attack.Kind == AttackKind.ComboFinisher && bonuses.ComboFinisherStamina > 0f)
            {
                // Kombo-Fluss (GDD 03 11.4 WM04).
                stats.Stamina.Restore(bonuses.ComboFinisherStamina);
            }
            else if (report.Target == combatant && report.Defense == DefenseOutcome.Parried && bonuses.ParryStamina > 0f)
            {
                // Gegenwehr (BW04): a perfect parry gives stamina back.
                stats.Stamina.Restore(bonuses.ParryStamina);
            }
        }
    }
}
