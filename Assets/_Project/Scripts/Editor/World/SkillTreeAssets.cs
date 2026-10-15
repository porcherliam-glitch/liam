using System.Collections.Generic;
using Aetherfall.EditorTools.Core;
using Aetherfall.Events;
using Aetherfall.Skills;
using Aetherfall.Stats;
using UnityEditor;

namespace Aetherfall.EditorTools.World
{
    /// <summary>
    /// The skill trees of Stufe A (GDD 03 11.3–11.5) as <see cref="SkillTreeDefinition"/> assets in <c>Data/Skills/</c>:
    /// Krieger with the 15 nodes marked "A" in 11.4 (core Kampfgeist, Waffenmeister 6, Bollwerk 5, Kriegsherr 3) and Magier
    /// with 15 nodes (core Elementarkunde, Pyromant 5, Frostweber 5, Blitzbinder 4, 11.5). The nodes are written on every run.
    /// </summary>
    public static class SkillTreeAssets
    {
        /// <summary>Folder of the trees.</summary>
        public const string Folder = SetupPaths.ProjectFolder + "/Data/Skills";

        private const string Krieger = "skill.krieger.";
        private const string Magier = "skill.magier.";

        /// <summary>Creates or updates both trees.</summary>
        /// <param name="report">Protocol.</param>
        /// <returns>The trees (warrior, mage), missing ones left out.</returns>
        public static List<SkillTreeDefinition> EnsureAll(TestGroundReport report)
        {
            var trees = new List<SkillTreeDefinition>(2);
            if (!TestGroundAssets.EnsureFolder(Folder, report))
            {
                return trees;
            }

            Add(trees, Ensure("SkillBaum_Krieger", "class.krieger", "Krieger", new[] { "Waffenmeister", "Bollwerk", "Kriegsherr" }, WarriorNodes(), report));
            Add(trees, Ensure("SkillBaum_Magier", "class.magier", "Magier", new[] { "Pyromant", "Frostweber", "Blitzbinder" }, MageNodes(), report));
            report.Info("Skill-Bäume (GDD 03, 11): " + trees.Count + " – Krieger und Magier mit je 15 Knoten, 1 Skillpunkt je Stufe.");
            return trees;
        }

        private static List<SkillNode> WarriorNodes()
        {
            string wm = Krieger + "waffenmeister.";
            string bw = Krieger + "bollwerk.";
            string kh = Krieger + "kriegsherr.";
            return new List<SkillNode>
            {
                // GDD 03 11.4 K00.
                Node(Krieger + "kern.kampfgeist", "Kampfgeist", "Nahkampfschaden +5 %, maximale Ausdauer +10.", SkillNodeKind.Core, 0, 1, 1, 0, null, null,
                    SkillEffect.ForStat(StatId.DamageBonus, 0.05f, false), SkillEffect.ForStat(StatId.MaxStamina, 10f, false)),
                // Waffenmeister.
                Node(wm + "klingenzucht", "Klingenzucht", "Leichte Angriffe +4 % Schaden je Rang.", SkillNodeKind.Passive, 1, 1, 3, 1, null, null,
                    SkillEffect.Bonus(SkillEffectKind.LightAttackDamage, 0.04f)),
                Node(wm + "wuchtiger_hieb", "Wuchtiger Hieb", "Haltungsschaden schwerer Angriffe +10 % je Rang.", SkillNodeKind.Passive, 1, 1, 2, 1, null, null,
                    SkillEffect.Bonus(SkillEffectKind.HeavyAttackPoise, 0.1f)),
                Node(wm + "wirbelklinge", "Wirbelklinge", "360°-Wirbel, 2 Umdrehungen, je 140 % Waffenschaden · 30 Ausdauer · Abklingzeit 8 s.",
                    SkillNodeKind.Active, 1, 1, 1, 1, null, null, SkillEffect.Learn(TechniqueAssets.Whirl)),
                Node(wm + "kombofluss", "Kombo-Fluss", "Ein Kombo-Abschluss, der trifft, gibt 8 Ausdauer zurück.", SkillNodeKind.Passive, 1, 2, 1, 1, null, null,
                    SkillEffect.Bonus(SkillEffectKind.ComboFinisherStamina, 8f)),
                Node(wm + "wirbelklinge_sog", "Wirbelklinge: Sog", "Zieht die Gegner im Wirbel bis zu 2 m heran. Gabelung mit Klingensturm.",
                    SkillNodeKind.Upgrade, 1, 2, 1, 1, new[] { wm + "wirbelklinge" }, wm + "wirbelklinge_sturm",
                    SkillEffect.ForAbility(SkillEffectKind.AbilityPull, TechniqueAssets.Whirl, 2f)),
                Node(wm + "wirbelklinge_sturm", "Wirbelklinge: Klingensturm", "3 Umdrehungen statt 2, kostet 10 Ausdauer mehr. Gabelung mit Sog.",
                    SkillNodeKind.Upgrade, 1, 2, 1, 1, new[] { wm + "wirbelklinge" }, wm + "wirbelklinge_sog",
                    SkillEffect.ForAbility(SkillEffectKind.AbilityHits, TechniqueAssets.Whirl, 1f),
                    SkillEffect.ForAbility(SkillEffectKind.AbilityStaminaCost, TechniqueAssets.Whirl, 10f)),
                // Bollwerk.
                Node(bw + "schildmauer", "Schildmauer", "Block-Stabilität +5 Prozentpunkte je Rang (weniger Ausdauer beim Blocken).", SkillNodeKind.Passive, 2, 1, 3, 1,
                    null, null, SkillEffect.Bonus(SkillEffectKind.BlockStability, 0.05f)),
                Node(bw + "eiserne_haut", "Eiserne Haut", "Rüstung +5 % je Rang.", SkillNodeKind.Passive, 2, 1, 3, 1, null, null,
                    SkillEffect.ForStat(StatId.Armor, 0.05f, true)),
                Node(bw + "schildschlag", "Schildschlag", "Stoß mit dem Schild: Haltung 40, Betäubung 50, unterbricht Normalgegner · 15 Ausdauer · Abklingzeit 6 s. Nur mit Schild.",
                    SkillNodeKind.Active, 2, 1, 1, 1, null, null, SkillEffect.Learn(TechniqueAssets.ShieldBash)),
                Node(bw + "gegenwehr", "Gegenwehr", "Eine perfekte Parade gibt 20 Ausdauer zurück.", SkillNodeKind.Passive, 2, 2, 1, 1, null, null,
                    SkillEffect.Bonus(SkillEffectKind.ParryStamina, 20f)),
                Node(bw + "spott", "Spott", "Kampfschrei 10 m: Gegner greifen 6 s lang dich an, Rüstung +20 % für diese Zeit · Abklingzeit 15 s.",
                    SkillNodeKind.Active, 2, 2, 1, 1, null, null, SkillEffect.Learn(TechniqueAssets.Taunt)),
                // Kriegsherr.
                Node(kh + "kommandostimme", "Kommandostimme", "Begleiter +5 % Schaden je Rang.", SkillNodeKind.Passive, 3, 1, 2, 1, null, null,
                    SkillEffect.Bonus(SkillEffectKind.CompanionDamage, 0.05f)),
                Node(kh + "kriegsschrei", "Kriegsschrei", "8 m: Gegnerschaden −20 % für 8 s, Normalgegner taumeln 1 s · 20 Ausdauer · Abklingzeit 20 s.",
                    SkillNodeKind.Active, 3, 1, 1, 1, null, null, SkillEffect.Learn(TechniqueAssets.WarCry)),
                Node(kh + "fussfeger", "Fußfeger", "Tiefer Kreishieb 3 m: wirft Gegner 1,2 s um (nicht Bosse), 90 % Waffenschaden · 25 Ausdauer · Abklingzeit 12 s.",
                    SkillNodeKind.Active, 3, 2, 1, 1, null, null, SkillEffect.Learn(TechniqueAssets.Sweep))
            };
        }

        private static List<SkillNode> MageNodes()
        {
            string py = Magier + "pyromant.";
            string fw = Magier + "frostweber.";
            string bb = Magier + "blitzbinder.";
            return new List<SkillNode>
            {
                // Core: the first spell of each school (GDD 03 11.1 "schaltet den Kernknoten der Klasse gratis frei").
                Node(Magier + "kern.elementarkunde", "Elementarkunde", "Feuerball, Eislanze und Kettenblitz; maximales Mana +10.", SkillNodeKind.Core, 0, 1, 1, 0,
                    null, null, SkillEffect.Learn(SpellAssets.Fireball), SkillEffect.Learn(SpellAssets.IceLance), SkillEffect.Learn(SpellAssets.ChainLightning),
                    SkillEffect.ForStat(StatId.MaxMana, 10f, false)),
                // Pyromant (5).
                Node(py + "glut_im_blut", "Glut im Blut", "Feuerzauber +6 % Schaden je Rang.", SkillNodeKind.Passive, 1, 1, 2, 1, null, null,
                    SkillEffect.ForElement(SkillEffectKind.ElementDamage, DamageType.Fire, 0.06f)),
                Node(py + "flammenteppich", "Flammenteppich", "Der Boden brennt 6 s im Umkreis von 4 m (Brennen 20 je s, zündet Öl) · 25 Mana · Abklingzeit 12 s.",
                    SkillNodeKind.Active, 1, 1, 1, 1, null, null, SkillEffect.Learn(SpellAssets.FlameCarpet)),
                Node(py + "glutmantel", "Glutmantel", "10 s Feuer-Aura: Nahkampf +20 % als Feuer, Gegner in 2,5 m beginnen zu brennen · 25 Mana · Abklingzeit 20 s.",
                    SkillNodeKind.Active, 1, 2, 1, 1, null, null, SkillEffect.Learn(SpellAssets.FireMantle)),
                Node(py + "zuendfunke", "Zündfunke", "Feuerzauber bauen 25 % mehr Brennen auf.", SkillNodeKind.Passive, 1, 2, 1, 1, null, null,
                    SkillEffect.ForElement(SkillEffectKind.ElementBuildup, DamageType.Fire, 0.25f)),
                Node(py + "feuerball_grossbrand", "Feuerball: Großbrand", "Die Explosion des Feuerballs wird 1 m größer (3 m).", SkillNodeKind.Upgrade, 1, 2, 1, 1,
                    null, null, SkillEffect.ForAbility(SkillEffectKind.AbilityRadius, SpellAssets.Fireball, 1f)),
                // Frostweber (5).
                Node(fw + "kaelteschliff", "Kälteschliff", "Eiszauber +6 % Schaden je Rang.", SkillNodeKind.Passive, 2, 1, 2, 1, null, null,
                    SkillEffect.ForElement(SkillEffectKind.ElementDamage, DamageType.Ice, 0.06f)),
                Node(fw + "frostnova", "Frostnova", "Frost-Ring 5 m um dich: Frieren 50 · 25 Mana · Abklingzeit 12 s.", SkillNodeKind.Active, 2, 1, 1, 1, null, null,
                    SkillEffect.Learn(SpellAssets.FrostNova)),
                Node(fw + "eispanzer", "Eispanzer", "Rüstung +30 % für 12 s, wer dich im Nahkampf trifft, baut Frieren 10 auf · 25 Mana · Abklingzeit 25 s.",
                    SkillNodeKind.Active, 2, 2, 1, 1, null, null, SkillEffect.Learn(SpellAssets.IceArmor)),
                Node(fw + "eisige_ruhe", "Eisige Ruhe", "Mana-Regeneration +10 %.", SkillNodeKind.Passive, 2, 2, 1, 1, null, null,
                    SkillEffect.ForStat(StatId.ManaRegenFactor, 0.1f, true)),
                Node(fw + "eislanze_splitter", "Eislanze: Splitterlanze", "Die Eislanze durchbohrt einen Gegner mehr (3 Ziele).", SkillNodeKind.Upgrade, 2, 2, 1, 1,
                    null, null, SkillEffect.ForAbility(SkillEffectKind.AbilityTargets, SpellAssets.IceLance, 1f)),
                // Blitzbinder (4).
                Node(bb + "leitfaehig", "Leitfähig", "Blitzzauber +6 % Schaden je Rang.", SkillNodeKind.Passive, 3, 1, 2, 1, null, null,
                    SkillEffect.ForElement(SkillEffectKind.ElementDamage, DamageType.Lightning, 0.06f)),
                Node(bb + "gewitterruf", "Gewitterruf", "3 Blitzeinschläge im Umkreis von 6 m: Schock 40 · 30 Mana · Abklingzeit 14 s.", SkillNodeKind.Active, 3, 1, 1, 1,
                    null, null, SkillEffect.Learn(SpellAssets.ThunderCall)),
                Node(bb + "sturmschritt", "Sturmschritt", "Tempo +20 % für 8 s, eine Rolle hinterlässt einen Schock · 20 Mana · Abklingzeit 20 s.", SkillNodeKind.Active,
                    3, 2, 1, 1, null, null, SkillEffect.Learn(SpellAssets.StormStep)),
                Node(bb + "kettenblitz_weiter", "Kettenblitz: Weiter Sprung", "Der Kettenblitz springt auf einen Gegner mehr (4 Ziele).", SkillNodeKind.Upgrade, 3, 2, 1,
                    1, null, null, SkillEffect.ForAbility(SkillEffectKind.AbilityTargets, SpellAssets.ChainLightning, 1f))
            };
        }

        private static SkillNode Node(string id, string name, string description, SkillNodeKind kind, int branch, int tier, int ranks, int cost, string[] requires,
            string forkWith, params SkillEffect[] effects)
        {
            return new SkillNode(id, name, description, kind, branch, tier, ranks, cost, requires, forkWith, effects);
        }

        private static void Add(List<SkillTreeDefinition> trees, SkillTreeDefinition tree)
        {
            if (tree != null)
            {
                trees.Add(tree);
            }
        }

        private static SkillTreeDefinition Ensure(string file, string classId, string name, string[] branches, List<SkillNode> nodes, TestGroundReport report)
        {
            var tree = TestGroundSerialized.EnsureAsset<SkillTreeDefinition>(Folder + "/" + file + ".asset", report, null);
            if (tree == null)
            {
                return null;
            }

            tree.Fill(classId, name, branches, nodes);
            EditorUtility.SetDirty(tree);
            string problem = tree.CreateTree().Validate();
            if (problem.Length > 0)
            {
                report.Warning("Skill-Baum " + name + ": " + problem);
            }

            return tree;
        }
    }
}
