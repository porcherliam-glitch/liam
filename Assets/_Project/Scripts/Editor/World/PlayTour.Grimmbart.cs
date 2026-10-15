using System;
using System.Linq;
using Aetherfall.AI;
using Aetherfall.AI.Bosses;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Player;
using Aetherfall.World;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Boss fight against Grimmbart in his quarry (GDD 02 11.6), as a chain of checks: the guards at the way in, the boss bar,
    /// the war horn that calls two bandits and can be lost, phase 2 with the kicked barrels, the crane stones and a charge into
    /// a stone block, phase 3 without armour and with fire pots that set the oil off, and finally kneeling and "Fesseln".
    /// </summary>
    public static partial class PlayTour
    {
        private const string GrimmbartGuards = "spawn.eichental.steinbruch_wache";

        private static BossController FindGrimmbart()
        {
            return Object.FindObjectsByType<BossController>(FindObjectsInactive.Exclude).FirstOrDefault(b => b.BossId == GrimmbartAssets.BossId);
        }

        private static void EnqueueGrimmbart()
        {
            Steps.Enqueue(KillGroup(GrimmbartGuards));
            Steps.Enqueue(GrimmbartAwakens());
            Steps.Enqueue(() => Capture("w13_grimmbart_bossbalken", null));
            Steps.Enqueue(GrimmbartHorn());
            Steps.Enqueue(() => Capture("w14_grimmbart_hornruf", ViewSpell));
            Steps.Enqueue(GrimmbartPhaseTwo());
            Steps.Enqueue(() => Capture("w15_grimmbart_kran", ViewSpell));
            Steps.Enqueue(GrimmbartChargeIntoBlock());
            Steps.Enqueue(() => Capture("w16_grimmbart_steinblock", ViewSpell));
            Steps.Enqueue(GrimmbartPhaseThree());
            Steps.Enqueue(() => Capture("w17_grimmbart_eisenbart", ViewSpell));
            Steps.Enqueue(GrimmbartYieldAndBind());
            Steps.Enqueue(() => Capture("w18_grimmbart_gefesselt", ViewSpell));
        }

        /// <summary>The player walks into the kettle: Grimmbart rises, the boss bar shows his name.</summary>
        private static Func<bool> GrimmbartAwakens()
        {
            int phase = 0;
            return () =>
            {
                BossController boss = FindGrimmbart();
                if (boss == null || boss.Brain == null)
                {
                    return Fail(Elapsed > 8.0, "Grimmbart fehlt im Steinbruch.");
                }

                switch (phase)
                {
                    case 0:
                        Vector3 into = boss.transform.position + boss.transform.forward * 7f;
                        PlaceOnGround(into, -boss.transform.forward);
                        _spellTarget = boss.Combatant;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    default:
                        if (!boss.Brain.IsEncounterRunning)
                        {
                            return Fail(Elapsed > 5.0, "Grimmbart erwacht nicht, obwohl der Spieler im Kessel steht.");
                        }

                        BossBarState bar = Services.Locator.Get<IBossBarService>().Current;
                        if (!bar.Visible || bar.BossId != GrimmbartAssets.BossId)
                        {
                            return Fail(Elapsed > 6.0, "Kein Bossbalken für Grimmbart.");
                        }

                        Note("Grimmbart erwacht: " + bar.DisplayName + " – " + bar.Title + ", Phase " + bar.Phase + " von " + bar.PhaseCount + ", " +
                             boss.Combatant.Health.Max.ToString("0") + " LP.");
                        return true;
                }
            };
        }

        /// <summary>Phase 1: the horn calls two bandits; then the horn is lost (stolen) and never sounds again.</summary>
        private static Func<bool> GrimmbartHorn()
        {
            return () =>
            {
                BossController boss = FindGrimmbart();
                BossHornCall horn = boss != null ? boss.GetComponent<BossHornCall>() : null;
                if (horn == null)
                {
                    return Fail(true, "Grimmbart hat kein Kriegshorn.");
                }

                if (horn.Calls < 1)
                {
                    return Fail(Elapsed > 12.0, "Grimmbart bläst das Kriegshorn nicht (12 s).");
                }

                if (Elapsed < 1.0)
                {
                    return false;
                }

                Note("Kriegshorn: " + horn.Calls + " Ruf(e), " + horn.ActiveHelpers + " Banditen kommen.");
                if (horn.ActiveHelpers < 2)
                {
                    return Fail(true, "Das Horn ruft nicht zwei Banditen.");
                }

                horn.TakeHorn();
                foreach (EnemyController helper in horn.Helpers)
                {
                    if (helper != null && helper.isActiveAndEnabled && helper.Combatant != null && helper.Combatant.IsAlive)
                    {
                        helper.Combatant.Health.Kill(SubjectIdsPlayer);
                    }
                }

                Note("Horn verloren: " + (!horn.HasHorn && boss.Brain.IsSpecialDisabled(BossHornCall.SpecialKey) ? "kein Hornruf mehr" : "FEHLER"));
                return Fail(horn.HasHorn, "Das Horn bleibt nach dem Verlust am Gürtel.") || true;
            };
        }

        /// <summary>Phase 2 at 60 %: he kicks the oil barrels over; the crane drops three stones (shadows first).</summary>
        private static Func<bool> GrimmbartPhaseTwo()
        {
            int phase = 0;
            return () =>
            {
                BossController boss = FindGrimmbart();
                if (boss == null)
                {
                    return Fail(true, "Grimmbart ist weg.");
                }

                BossBarrelKick kick = boss.GetComponent<BossBarrelKick>();
                BossCraneDrop crane = boss.GetComponent<BossCraneDrop>();
                switch (phase)
                {
                    case 0:
                        boss.Combatant.Health.RestoreState(boss.Combatant.Health.Max * 0.55f);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    case 1:
                        if (boss.Brain.Phase < 2 || kick.Kicked < 2)
                        {
                            return Fail(Elapsed > 6.0, "Phase 2: Grimmbart tritt die Ölfässer nicht um (Phase " + boss.Brain.Phase + ", " + kick.Kicked + ").");
                        }

                        Note("Phase 2 „Steinbruch“: " + kick.Kicked + " Ölfässer umgetreten, Öl am Boden.");
                        // The crane is checked directly (its own timing is random); the brain then charges only.
                        boss.DisableSpecial(BossCraneDrop.SpecialKey);
                        crane.Drop(FindPlayer().transform.position + FindPlayer().transform.forward * 2f);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 2;
                        return false;
                    default:
                        if (Elapsed < 1.1)
                        {
                            return false;
                        }

                        Note("Kran: Schatten am Boden, " + crane.Pending + " Steine im Anflug.");
                        return Fail(crane.Pending < 1, "Der Kran lässt keine Steine fallen.") || true;
                }
            };
        }

        /// <summary>A charge that runs into a stone block stuns Grimmbart for 4 s.</summary>
        private static Func<bool> GrimmbartChargeIntoBlock()
        {
            int phase = 0;
            return () =>
            {
                BossController boss = FindGrimmbart();
                if (boss == null)
                {
                    return Fail(true, "Grimmbart ist weg.");
                }

                BossCraneDrop crane = boss.GetComponent<BossCraneDrop>();
                switch (phase)
                {
                    case 0:
                        if (crane.Pending > 0 && Elapsed < 4.0)
                        {
                            return false;
                        }

                        Note("Kran: " + crane.Landed + " Steine gelandet, " + crane.Hits + " Treffer.");
                        GameObject block = GameObject.Find("Steinblock 1");
                        if (block == null)
                        {
                            return Fail(true, "Kein Steinblock in der Arena.");
                        }

                        // Grimmbart 6 m on one side of the block, the player 4 m on the other: the charge goes straight into the stone.
                        Vector3 k = block.transform.position;
                        Vector3 bossSpot = new Vector3(k.x, k.y, k.z - 6f);
                        var controller = boss.GetComponent<CharacterController>();
                        controller.enabled = false;
                        boss.transform.SetPositionAndRotation(bossSpot, Quaternion.LookRotation(Vector3.forward));
                        controller.enabled = true;
                        PlaceOnGround(new Vector3(k.x, k.y, k.z + 4f), Vector3.back);
                        boss.ChargeStopped += OnGrimmbartStopped;
                        _grimmbartStopped = false;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    default:
                        if (!_grimmbartStopped)
                        {
                            return Fail(Elapsed > 15.0, "Grimmbart rennt nicht in den Steinblock (Zustand " + boss.Brain.State + ").");
                        }

                        boss.ChargeStopped -= OnGrimmbartStopped;
                        Note("Sturmangriff in den Steinblock: betäubt (" + boss.Brain.StunKind + ", " + boss.Brain.StunRemaining.ToString("0.0") + " s).");
                        return Fail(boss.Brain.State != BossStateId.Stunned, "Nach dem Aufprall ist Grimmbart nicht betäubt.") || true;
                }
            };
        }

        private static bool _grimmbartStopped;

        private static void OnGrimmbartStopped()
        {
            _grimmbartStopped = true;
        }

        /// <summary>Phase 3 at 30 %: armour off (faster, more damage taken); a fire pot sets an oil puddle off.</summary>
        private static Func<bool> GrimmbartPhaseThree()
        {
            int phase = 0;
            return () =>
            {
                BossController boss = FindGrimmbart();
                if (boss == null)
                {
                    return Fail(true, "Grimmbart ist weg.");
                }

                BossArmorShed shed = boss.GetComponent<BossArmorShed>();
                BossFirePots pots = boss.GetComponent<BossFirePots>();
                switch (phase)
                {
                    case 0:
                        if (boss.Brain.State == BossStateId.Stunned && Elapsed < 5.0)
                        {
                            return false;
                        }

                        boss.Combatant.Health.RestoreState(boss.Combatant.Health.Max * 0.25f);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    case 1:
                        if (boss.Brain.Phase < 3 || !shed.IsShed)
                        {
                            return Fail(Elapsed > 6.0, "Phase 3: Grimmbart legt die Rüstung nicht ab.");
                        }

                        Note("Phase 3 „Eisenbart“: Rüstung ab, Angriffstempo ×" + boss.Brain.AttackSpeed.ToString("0.00") + ", Schaden ×" +
                             boss.Combatant.DamageTakenFactor.ToString("0.00") + ".");
                        ElementArea oil = Object.FindObjectsByType<ElementArea>(FindObjectsInactive.Exclude)
                            .FirstOrDefault(a => a.Kind == ElementAreaKind.Oil && Vector3.Distance(a.transform.position, boss.transform.position) < 30f);
                        if (oil == null)
                        {
                            return Fail(true, "Keine Ölpfütze für den Brandtopf.");
                        }

                        pots.Throw(oil.transform.position);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 2;
                        return false;
                    default:
                        if (pots.Shattered < 1)
                        {
                            return Fail(Elapsed > 3.0, "Der Brandtopf zerschellt nicht.");
                        }

                        if (Elapsed < 0.5)
                        {
                            return false;
                        }

                        Note("Brandtopf: " + pots.Shattered + " zerschellt, " + pots.Ignited + " Ölpfütze(n) explodiert.");
                        return Fail(pots.Ignited < 1, "Feuer und Öl ergeben keine Explosion.") || true;
                }
            };
        }

        /// <summary>At 10 % he kneels; "Fesseln" binds him alive, the boss bar goes away.</summary>
        private static Func<bool> GrimmbartYieldAndBind()
        {
            int phase = 0;
            return () =>
            {
                BossController boss = FindGrimmbart();
                if (boss == null)
                {
                    return Fail(true, "Grimmbart ist weg.");
                }

                switch (phase)
                {
                    case 0:
                        boss.Combatant.Health.RestoreState(boss.Combatant.Health.Max * 0.08f);
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 1;
                        return false;
                    case 1:
                        if (!boss.IsYielding)
                        {
                            return Fail(Elapsed > 5.0, "Grimmbart kniet bei 8 % nicht nieder (Zustand " + boss.Brain.State + ").");
                        }

                        PlaceOnGround(boss.transform.position + boss.transform.forward * 1.8f, -boss.transform.forward);
                        BossBindInteraction bind = boss.GetComponentInChildren<BossBindInteraction>();
                        PlayerMotor player = FindPlayer();
                        var context = new InteractionContext("player", player.transform.position, true);
                        Note("Grimmbart kniet: „" + bind.InteractionPrompt + "“ möglich = " + bind.CanInteract(context) + ".");
                        if (!bind.Interact(context))
                        {
                            return Fail(true, "Fesseln geht nicht.");
                        }

                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        phase = 2;
                        return false;
                    default:
                        if (Elapsed < 1.0)
                        {
                            return false;
                        }

                        BossBarState bar = Services.Locator.Get<IBossBarService>().Current;
                        Note("Gefesselt: " + boss.IsSubdued + ", lebt = " + boss.Combatant.IsAlive + ", Bossbalken sichtbar = " + bar.Visible + ".");
                        return Fail(!boss.IsSubdued || !boss.Combatant.IsAlive || bar.Visible, "Grimmbart ist nicht lebend gefesselt.") || true;
                }
            };
        }
    }
}
