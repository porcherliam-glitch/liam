using System;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.Combat;
using Aetherfall.Player;
using Aetherfall.Stats;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Spell part of the mage tour (GDD 03 6.4, 11.8): the class gives Feuerball, Eislanze and Kettenblitz on bar 1; the other six
    /// spells and three upgrades are learned on the skill page (PlayTour.Skills); then every spell is cast at a wolf the way keys 1–4 do and
    /// its effect is checked (hits, burning ground, buffs on armor and speed), with a picture of each, and bar 2 is shown.
    /// </summary>
    public static partial class PlayTour
    {
        private static Combatant _spellTarget;

        private static void BuildSpellPlan()
        {
            Steps.Enqueue(CheckClassSpells);
            // GDD 03 11.5: the six other spells and three upgrades come from the skill tree (15 points, as from level 16).
            string py = "skill.magier.pyromant.";
            string fw = "skill.magier.frostweber.";
            string bb = "skill.magier.blitzbinder.";
            Steps.Enqueue(LearnInSkillPage(new[]
            {
                py + "glut_im_blut", py + "glut_im_blut", py + "flammenteppich", py + "glutmantel", py + "feuerball_grossbrand",
                fw + "kaelteschliff", fw + "kaelteschliff", fw + "frostnova", fw + "eispanzer", fw + "eislanze_splitter",
                bb + "leitfaehig", bb + "leitfaehig", bb + "gewitterruf", bb + "sturmschritt", bb + "kettenblitz_weiter"
            }, 15, "m03b_skillbaum"));
            Steps.Enqueue(ReportUpgrades);
            Steps.Enqueue(CastSpell(SpellAssets.Fireball, 9f, 0f));
            Steps.Enqueue(() => Capture("m04a_feuerball", ViewSpell));
            Steps.Enqueue(CastSpell(SpellAssets.IceLance, 9f, 0f));
            Steps.Enqueue(() => Capture("m04b_eislanze", ViewSpell));
            Steps.Enqueue(CastSpell(SpellAssets.ChainLightning, 8f, 0.05f));
            Steps.Enqueue(() => Capture("m04c_kettenblitz", ViewSpell));
            Steps.Enqueue(CastSpell(SpellAssets.FlameCarpet, 9f, 0.8f));
            Steps.Enqueue(() => Capture("m04d_flammenteppich", ViewSpell));
            Steps.Enqueue(CastSpell(SpellAssets.FrostNova, 3f, 0.12f));
            Steps.Enqueue(() => Capture("m04e_frostnova", ViewSpell));
            Steps.Enqueue(CastSpell(SpellAssets.ThunderCall, 9f, 0.45f));
            Steps.Enqueue(() => Capture("m04f_gewitterruf", ViewSpell));
            Steps.Enqueue(CastSpell(SpellAssets.FireMantle, 6f, 0.5f));
            Steps.Enqueue(CastSpell(SpellAssets.IceArmor, 6f, 0.5f));
            Steps.Enqueue(() => Capture("m04g_eispanzer", ViewBehindPlayer));
            Steps.Enqueue(CastSpell(SpellAssets.StormStep, 6f, 0.3f));
            Steps.Enqueue(ShowSecondBar);
            Steps.Enqueue(() => Capture("m05_leiste2", null));
            Steps.Enqueue(BackToFirstBar);
        }

        /// <summary>The class grants the first spell of each school, and they sit on bar 1, slots 1–3.</summary>
        private static bool CheckClassSpells()
        {
            PlayerMotor player = FindPlayer();
            PlayerAbilityCaster caster = player != null ? player.GetComponent<PlayerAbilityCaster>() : null;
            if (caster == null || caster.AbilityCount < 10)
            {
                return Fail(true, "Die Spielfigur hat keine Zauber (" + (caster != null ? caster.AbilityCount.ToString() : "kein PlayerAbilityCaster") + ").");
            }

            for (int i = 0; i < SpellAssets.MageStart.Length; i++)
            {
                string id = SpellAssets.MageStart[i];
                if (!caster.IsLearned(id) || caster.Bar.Get(i) != id)
                {
                    return Fail(Elapsed > 3.0, "Startzauber " + id + ": gelernt " + caster.IsLearned(id) + ", Platz " + (caster.Bar.IndexOf(id) + 1) + ".");
                }
            }

            Note("Klasse Magier: Leiste 1 = " + BarText(caster, 0) + "; nicht gelernt: Flammenteppich " + !caster.IsLearned(SpellAssets.FlameCarpet) + ".");
            return true;
        }

        /// <summary>
        /// Learns the spell if needed (tool), stands <paramref name="distance"/> metres in front of a wolf, locks on and casts like
        /// the key; waits for the effect (projectiles: the impact) and <paramref name="settle"/> seconds more, then checks it.
        /// </summary>
        private static Func<bool> CastSpell(string abilityId, float distance, float settle)
        {
            int phase = 0;
            int hitsBefore = 0;
            int attempts = 0;
            float armorBefore = 0f;
            float speedBefore = 0f;
            double released = 0.0;
            return () =>
            {
                PlayerMotor player = FindPlayer();
                PlayerAbilityCaster caster = player != null ? player.GetComponent<PlayerAbilityCaster>() : null;
                CharacterStatsComponent stats = player != null ? player.GetComponent<CharacterStatsComponent>() : null;
                AbilitySpec spec = caster != null ? caster.GetSpec(abilityId) : null;
                AbilityRunner runner = caster != null ? caster.GetRunner(abilityId) : null;
                if (spec == null || runner == null || stats == null)
                {
                    return Fail(true, "Zauber " + abilityId + " fehlt an der Spielfigur.");
                }

                switch (phase)
                {
                    case 0:
                        if (!caster.IsLearned(abilityId))
                        {
                            return Fail(true, spec.DisplayName + " ist nicht gelernt (Skill-Baum).");
                        }

                        if (!PlaceBeforeWolf(player, distance))
                        {
                            return Fail(Elapsed > 6.0, "Kein lebender Wolf für " + spec.DisplayName + ".");
                        }

                        stats.Mana.Refill();
                        stats.Stamina.Refill();
                        runner.Reset();
                        hitsBefore = caster.HitsOf(abilityId);
                        armorBefore = stats.Stats.Get(StatId.Armor);
                        speedBefore = stats.Stats.Get(StatId.MoveSpeed);
                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (Elapsed < 0.35)
                        {
                            return false;
                        }

                        if (!caster.TryCast(abilityId))
                        {
                            // A wolf may just have staggered the player: try again a moment later.
                            if (Elapsed > 6.0)
                            {
                                return Fail(true, spec.DisplayName + " startet nicht: " + caster.LastRefusal + " (Mana " + caster.Mana.ToString("0") + ").");
                            }

                            _stepStart = UnityEditor.EditorApplication.timeSinceStartup - 0.2;
                            return false;
                        }

                        attempts++;
                        phase = 2;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 2:
                        if (runner.Phase == AbilityPhase.Windup)
                        {
                            return Fail(Elapsed > 3.0, spec.DisplayName + " bleibt im Ausholen hängen.");
                        }

                        if (runner.CooldownRemaining <= 0f)
                        {
                            // Cancelled in the wind-up (hit): cast again.
                            if (attempts >= 4)
                            {
                                return Fail(true, spec.DisplayName + " wurde viermal unterbrochen.");
                            }

                            phase = 0;
                            _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                            return false;
                        }

                        released = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 3;
                        return false;
                    default:
                        double since = UnityEditor.EditorApplication.timeSinceStartup - released;
                        int hits = caster.HitsOf(abilityId) - hitsBefore;
                        if (spec.Kind == AbilityKind.Projectile && hits == 0 && since < 2.5)
                        {
                            return false;
                        }

                        if (since < settle)
                        {
                            return false;
                        }

                        return Report(caster, stats, spec, hits, armorBefore, speedBefore);
                }
            };
        }

        private static bool Report(PlayerAbilityCaster caster, CharacterStatsComponent stats, AbilitySpec spec, int hits, float armorBefore, float speedBefore)
        {
            string cost = (spec.StaminaCost > 0f ? "Ausdauer " + spec.StaminaCost.ToString("0.#") : "Mana " + caster.GetRunner(spec.Id).ManaCost.ToString("0.#")) +
                          ", Abklingzeit " + spec.CooldownSeconds.ToString("0") + " s";
            string target = _spellTarget != null ? ", Ziel-LP " + (_spellTarget.IsAlive ? _spellTarget.Health.Current.ToString("0") : "tot") +
                                                   ", Aufbau Brennen/Frieren/Schock " + _spellTarget.Status.Buildup(StatusEffectId.Burning).ToString("0") + "/" +
                                                   _spellTarget.Status.Buildup(StatusEffectId.Freezing).ToString("0") + "/" +
                                                   _spellTarget.Status.Buildup(StatusEffectId.Shock).ToString("0") : string.Empty;
            switch (spec.BuffKind)
            {
                case AbilityBuffKind.IceArmor:
                    float armor = stats.Stats.Get(StatId.Armor);
                    Note(spec.DisplayName + ": Rüstung " + armorBefore.ToString("0") + " → " + armor.ToString("0") + " für " + spec.BuffSeconds.ToString("0") + " s (" + cost + ").");
                    return (caster.Buffs.IsActive(AbilityBuffKind.IceArmor) && armor > armorBefore) || Fail(true, "Eispanzer erhöht die Rüstung nicht.");
                case AbilityBuffKind.StormStep:
                    float speed = stats.Stats.Get(StatId.MoveSpeed);
                    Note(spec.DisplayName + ": Tempo " + (speedBefore * 100f).ToString("0") + " % → " + (speed * 100f).ToString("0") + " % (" + cost + ").");
                    return (caster.Buffs.IsActive(AbilityBuffKind.StormStep) && speed > speedBefore) || Fail(true, "Sturmschritt macht nicht schneller.");
                case AbilityBuffKind.FireMantle:
                    float share = FindPlayer().GetComponent<PlayerCombatController>().MeleeFireShare;
                    Note(spec.DisplayName + ": Nahkampf +" + (share * 100f).ToString("0") + " % als Feuer, Aura brennt 2,5 m (" + cost + ").");
                    return (caster.Buffs.IsActive(AbilityBuffKind.FireMantle) && share > 0f) || Fail(true, "Glutmantel wirkt nicht.");
            }

            Note(spec.DisplayName + " (" + spec.Kind + "): " + hits + " Treffer" + target + " (" + cost + ").");
            return hits > 0 || Fail(true, spec.DisplayName + " hat nichts getroffen.");
        }

        /// <summary>Picks a living wolf (1000 health for the check, so it lasts all spells) and stands in front of it, locked on.</summary>
        private static bool PlaceBeforeWolf(PlayerMotor player, float distance)
        {
            if (_spellTarget == null || !_spellTarget.IsAlive)
            {
                // A wolf that stands still: not the one the burning check set on fire (it flees).
                EnemyController enemy = NearestLivingWolf(player.transform.position, _burnedWolf);
                if (enemy == null)
                {
                    return false;
                }

                _spellTarget = enemy.GetComponent<Combatant>();
                _spellTarget.Health.Pool.SetFixedMax(1000f);
                _spellTarget.Health.RestoreState(1000f);
            }

            Vector3 front = _spellTarget.transform.forward;
            front.y = 0f;
            if (front.sqrMagnitude < 0.01f)
            {
                front = Vector3.forward;
            }

            PlaceOnGround(_spellTarget.transform.position + front.normalized * distance, -front);
            player.GetComponent<PlayerLockOn>().Lock(_spellTarget);
            return true;
        }

        /// <summary>Switches to bar 2 (key X) and notes what is on it.</summary>
        private static bool ShowSecondBar()
        {
            PlayerAbilityCaster caster = FindPlayer().GetComponent<PlayerAbilityCaster>();
            if (caster.Bar.ActiveBar == 0 && !caster.Bar.TrySwitch())
            {
                return Fail(Elapsed > 2.0, "Die Leiste lässt sich nicht wechseln.");
            }

            FindPlayer().GetComponent<PlayerLockOn>().Release();
            Note("Leiste 2 (X): " + BarText(caster, 1) + ".");
            return caster.Bar.ActiveBar == 1;
        }

        private static bool BackToFirstBar()
        {
            PlayerAbilityCaster caster = FindPlayer().GetComponent<PlayerAbilityCaster>();
            if (caster.Bar.ActiveBar == 1 && !caster.Bar.TrySwitch())
            {
                return Fail(Elapsed > 2.0, "Die Leiste lässt sich nicht zurückwechseln.");
            }

            return caster.Bar.ActiveBar == 0;
        }

        private static string BarText(PlayerAbilityCaster caster, int bar)
        {
            var names = new string[AbilityBar.SlotsPerBar];
            for (int i = 0; i < names.Length; i++)
            {
                string id = caster.Bar.Get(bar * AbilityBar.SlotsPerBar + i);
                AbilitySpec spec = id.Length > 0 ? caster.GetSpec(id) : null;
                names[i] = (i + 1) + " " + (spec != null ? spec.DisplayName : "leer");
            }

            return string.Join(", ", names);
        }

        /// <summary>From the side of the line player – target, high enough to see both and the effect between them.</summary>
        private static Pose ViewSpell(Transform player)
        {
            Vector3 p = player.position;
            Vector3 t = _spellTarget != null ? _spellTarget.transform.position : p + player.forward * 6f;
            Vector3 line = t - p;
            line.y = 0f;
            Vector3 side = line.sqrMagnitude > 0.01f ? Vector3.Cross(Vector3.up, line.normalized) : player.right;
            Vector3 middle = (p + t) * 0.5f;
            float back = Mathf.Max(7f, line.magnitude * 0.9f);
            return Look(middle - side * back + Vector3.up * 4f - line.normalized * 2f, middle + Vector3.up * 0.8f);
        }
    }
}
