using System;
using UnityEngine;

namespace Aetherfall.Skills
{
    /// <summary>
    /// One node of a skill tree (GDD 03 11.3, 11.4): id, name, effect text, type, branch and stage, ranks and cost, what it needs
    /// (other nodes, a fork partner, a level) and its effects per rank.
    /// </summary>
    /// <remarks>
    /// Stages need points in the same branch (GDD 03 11.3): I from 0, II from 3, III from 6, IV from 10, V (key) from 14. Every
    /// node except the core needs the core.
    /// </remarks>
    [Serializable]
    public sealed class SkillNode
    {
        [Tooltip("ID, z. B. skill.krieger.waffenmeister.wirbelklinge.")]
        [SerializeField] private string id = "skill.neu";

        [Tooltip("Name im Skill-Baum.")]
        [SerializeField] private string displayName = "Neuer Knoten";

        [Tooltip("Wirkung in einem Satz (deutsch).")]
        [TextArea(2, 4)] [SerializeField] private string description = "";

        [Tooltip("Knotentyp: Kern, Passiv, Aktiv, Verbesserung, Schlüssel.")]
        [SerializeField] private SkillNodeKind kind = SkillNodeKind.Passive;

        [Tooltip("Ast: 0 = Kern, 1–3 = die drei Äste der Klasse.")]
        [Range(0, 3)] [SerializeField] private int branch = 1;

        [Tooltip("Stufe im Ast: I ab 0, II ab 3, III ab 6, IV ab 10, V ab 14 Punkten im Ast.")]
        [Range(1, 5)] [SerializeField] private int tier = 1;

        [Tooltip("Ränge (Passiv 1–3, sonst 1).")]
        [Range(1, 5)] [SerializeField] private int maxRank = 1;

        [Tooltip("Kosten je Rang in Skillpunkten (Kern der Startklasse 0, Schlüssel 2).")]
        [Range(0, 3)] [SerializeField] private int cost = 1;

        [Tooltip("Knoten, die vorher gelernt sein müssen (z. B. die Fähigkeit vor ihrer Verbesserung).")]
        [SerializeField] private string[] requires = new string[0];

        [Tooltip("Gabelung: nur dieser oder der andere Knoten (leer = keine Gabelung).")]
        [SerializeField] private string forkWith = "";

        [Tooltip("Mindest-Stufe der Figur (Schlüsselknoten 20).")]
        [Range(1, 80)] [SerializeField] private int minLevel = 1;

        [Tooltip("Wirkungen je Rang.")]
        [SerializeField] private SkillEffect[] effects = new SkillEffect[0];

        /// <summary>Creates an empty node (inspector).</summary>
        public SkillNode()
        {
        }

        /// <summary>Creates a node (generators, tests).</summary>
        /// <param name="id">Id.</param>
        /// <param name="displayName">Name.</param>
        /// <param name="description">Effect text.</param>
        /// <param name="kind">Type.</param>
        /// <param name="branch">Branch 0–3.</param>
        /// <param name="tier">Stage 1–5.</param>
        /// <param name="maxRank">Ranks.</param>
        /// <param name="cost">Cost per rank.</param>
        /// <param name="requires">Required nodes (null = none).</param>
        /// <param name="forkWith">Fork partner (empty = none).</param>
        /// <param name="effects">Effects per rank.</param>
        /// <param name="minLevel">Minimum character level.</param>
        public SkillNode(string id, string displayName, string description, SkillNodeKind kind, int branch, int tier, int maxRank, int cost,
            string[] requires, string forkWith, SkillEffect[] effects, int minLevel = 1)
        {
            this.id = id ?? string.Empty;
            this.displayName = displayName ?? string.Empty;
            this.description = description ?? string.Empty;
            this.kind = kind;
            this.branch = branch;
            this.tier = tier;
            this.maxRank = maxRank;
            this.cost = cost;
            this.requires = requires ?? new string[0];
            this.forkWith = forkWith ?? string.Empty;
            this.effects = effects ?? new SkillEffect[0];
            this.minLevel = minLevel;
        }

        /// <summary>Id.</summary>
        public string Id => id ?? string.Empty;

        /// <summary>Name.</summary>
        public string DisplayName => displayName ?? string.Empty;

        /// <summary>Effect text.</summary>
        public string Description => description ?? string.Empty;

        /// <summary>Type.</summary>
        public SkillNodeKind Kind => kind;

        /// <summary>Branch 0 (core) to 3.</summary>
        public int Branch => branch;

        /// <summary>Stage 1–5.</summary>
        public int Tier => tier;

        /// <summary>Ranks.</summary>
        public int MaxRank => Math.Max(1, maxRank);

        /// <summary>Cost per rank.</summary>
        public int Cost => Math.Max(0, cost);

        /// <summary>Required nodes.</summary>
        public string[] Requires => requires ?? new string[0];

        /// <summary>Fork partner, or empty.</summary>
        public string ForkWith => forkWith ?? string.Empty;

        /// <summary>Minimum character level.</summary>
        public int MinLevel => Math.Max(1, minLevel);

        /// <summary>Effects per rank.</summary>
        public SkillEffect[] Effects => effects ?? new SkillEffect[0];

        /// <summary>The ability an active node teaches, or empty.</summary>
        public string AbilityId
        {
            get
            {
                SkillEffect[] list = Effects;
                for (int i = 0; i < list.Length; i++)
                {
                    if (list[i] != null && list[i].Kind == SkillEffectKind.LearnAbility)
                    {
                        return list[i].AbilityId;
                    }
                }

                return string.Empty;
            }
        }
    }
}
