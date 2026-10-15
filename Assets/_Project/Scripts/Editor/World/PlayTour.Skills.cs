using System;
using System.Linq;
using Aetherfall.Combat;
using Aetherfall.Core;
using Aetherfall.Player;
using Aetherfall.Progression;
using Aetherfall.Skills;
using Aetherfall.UI.Framework;
using Aetherfall.UI.Screens;
using Object = UnityEngine.Object;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// Skill tree part of the tours (GDD 03 11): gives skill points like a quest reward, opens the journal on the page
    /// "Fähigkeiten" (key K), learns nodes the way the A button does, takes the last one back and learns it again (allowed while
    /// the page is open), moves an ability along the bar (LT/RT), takes a picture of the page and closes it.
    /// </summary>
    public static partial class PlayTour
    {
        private static Func<bool> LearnInSkillPage(string[] nodeIds, int points, string picture)
        {
            int phase = 0;
            return () =>
            {
                IServiceLocator locator = Services.Locator;
                if (locator == null || !locator.TryGet(out ISkillService skills) || !locator.TryGet(out IProgressionService progression))
                {
                    return Fail(true, "Kein Skill-Dienst (SkillInstaller fehlt in der BootConfig).");
                }

                JournalScreen journal = locator.TryGet(out IUIManager ui) ? ui.Top as JournalScreen : null;
                switch (phase)
                {
                    case 0:
                        if (skills.CurrentTree == null)
                        {
                            return Fail(Elapsed > 3.0, "Die Klasse hat keinen Skill-Baum.");
                        }

                        progression.AddSkillPoints(points, "rundgang");
                        UIRoot root = Object.FindAnyObjectByType<UIRoot>();
                        if (root == null || !root.OpenJournal(JournalPage.Skills))
                        {
                            return Fail(Elapsed > 3.0, "Die Skill-Seite öffnet sich nicht.");
                        }

                        phase = 1;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 1:
                        if (journal == null || journal.Page != JournalPage.Skills || Elapsed < 0.3)
                        {
                            return Fail(Elapsed > 4.0, "Das Tagebuch zeigt nicht die Seite „Fähigkeiten“.");
                        }

                        Note("Skill-Baum " + skills.CurrentTree.DisplayName + ": " + journal.SkillNodes.Count + " Knoten, Kern gelernt: " +
                             (skills.Rank(skills.CurrentTree.Core.Id) > 0) + ", freie Punkte " + skills.FreePoints + ".");
                        foreach (string nodeId in nodeIds)
                        {
                            if (!LearnRow(journal, skills, nodeId))
                            {
                                return false;
                            }
                        }

                        // GDD 03 11.9: taking back works until the page closes; learn it again afterwards.
                        string last = nodeIds[nodeIds.Length - 1];
                        int index = IndexOf(journal, last);
                        int rank = skills.Rank(last);
                        journal.Secondary(index);
                        bool tookBack = skills.Rank(last) == rank - 1;
                        journal.Submit(index);
                        Note("Zurücknehmen von „" + journal.SkillNodes[index].DisplayName + "“: " + (tookBack ? "geht" : "geht nicht") + ", wieder gelernt: " +
                             (skills.Rank(last) == rank) + ". Freie Punkte danach: " + skills.FreePoints + ".");
                        if (!tookBack || skills.Rank(last) != rank)
                        {
                            return Fail(true, "Zurücknehmen auf der Skill-Seite funktioniert nicht.");
                        }

                        MoveFirstAbility(journal, skills);
                        phase = 2;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    case 2:
                        if (!Capture(picture, null))
                        {
                            return false;
                        }

                        journal?.Back(false);
                        phase = 3;
                        _stepStart = UnityEditor.EditorApplication.timeSinceStartup;
                        return false;
                    default:
                        return (ui != null && !(ui.Top is JournalScreen) && Elapsed > 0.3) || Fail(Elapsed > 3.0, "Die Skill-Seite schließt nicht.");
                }
            };
        }

        private static bool LearnRow(JournalScreen journal, ISkillService skills, string nodeId)
        {
            int index = IndexOf(journal, nodeId);
            if (index < 0)
            {
                return Fail(true, "Knoten " + nodeId + " fehlt auf der Skill-Seite.");
            }

            int before = skills.Rank(nodeId);
            SkillCheck check = skills.Check(nodeId);
            journal.Submit(index);
            if (skills.Rank(nodeId) != before + 1)
            {
                return Fail(true, "„" + journal.SkillNodes[index].DisplayName + "“ lässt sich nicht lernen: " + check + ".");
            }

            Note("Gelernt: " + journal.SkillNodes[index].DisplayName + " (Rang " + skills.Rank(nodeId) + "), freie Punkte " + skills.FreePoints + ".");
            return true;
        }

        private static int IndexOf(JournalScreen journal, string nodeId)
        {
            for (int i = 0; i < journal.SkillNodes.Count; i++)
            {
                if (journal.SkillNodes[i].Id == nodeId)
                {
                    return i;
                }
            }

            return -1;
        }

        private static void MoveFirstAbility(JournalScreen journal, ISkillService skills)
        {
            // LT/RT moves the focused ability along the bar (GDD 03 11.8); here: the first learned active node.
            SkillNode active = journal.SkillNodes.FirstOrDefault(n => n.Kind == SkillNodeKind.Active && skills.Rank(n.Id) > 0);
            if (active == null || skills.Loadout == null)
            {
                Note("Leiste: keine gelernte Fähigkeit zum Verschieben.");
                return;
            }

            int before = skills.Loadout.SlotOf(active.AbilityId);
            skills.Loadout.MoveToNextSlot(active.AbilityId, 1);
            int after = skills.Loadout.SlotOf(active.AbilityId);
            skills.Loadout.MoveToNextSlot(active.AbilityId, -1);
            Note("Leiste: „" + active.DisplayName + "“ Platz " + (before + 1) + " → " + (after + 1) + " → zurück auf " + (skills.Loadout.SlotOf(active.AbilityId) + 1) +
                 " (0 = nicht auf der Leiste).");
        }

        /// <summary>Notes what the skill upgrades changed on the spells (effective values at the caster).</summary>
        private static bool ReportUpgrades()
        {
            PlayerAbilityCaster caster = FindPlayer().GetComponent<PlayerAbilityCaster>();
            AbilitySpec fireball = caster.GetSpec(SpellAssets.Fireball);
            AbilitySpec lance = caster.GetSpec(SpellAssets.IceLance);
            AbilitySpec chain = caster.GetSpec(SpellAssets.ChainLightning);
            Note("Verbesserungen: Feuerball-Explosion " + fireball.ExplosionRadius.ToString("0.#") + " m, Eislanze " + lance.MaxTargets + " Ziele, Kettenblitz " +
                 chain.ChainTargets + " Ziele, Brennen des Feuerballs " + fireball.Buildup.ToString("0.#") + ".");
            return (fireball.ExplosionRadius > 2.5f && lance.MaxTargets == 3 && chain.ChainTargets == 4) ||
                   Fail(true, "Die Verbesserungen des Skill-Baums kommen nicht an den Zaubern an.");
        }
    }
}
