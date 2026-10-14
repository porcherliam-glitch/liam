using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Stats;
using UnityEngine;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Action "Dialog/Bestechen" (GDD 02, 12.3): the player pays the bribe price to the conversation partner. Price = base price ×
    /// greed of the NPC × (1 − min(0.3; (Charisma − 10) × 0.02)) (<see cref="BribePricing"/>). An option that leads to this action
    /// shows "[80 Gold]", is grey without enough gold and is not offered by NPCs with the tag "unbestechlich".
    /// </summary>
    [Serializable]
    [TypeMenu("Dialog/Bestechen", 2)]
    public sealed class Bribe : GameAction, IDialogueBadgeSource
    {
        [Tooltip("Grundpreis in Gold (vor Gier des NPC und Charisma-Rabatt).")]
        [Min(1)] [SerializeField] private int basePrice = 50;

        /// <summary>Creates an empty action (inspector).</summary>
        public Bribe()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="basePrice">Base price in gold.</param>
        public Bribe(int basePrice)
        {
            this.basePrice = basePrice;
        }

        /// <summary>Base price in gold.</summary>
        public int BasePrice => basePrice;

        /// <inheritdoc />
        public DialogueOptionMarks DialogueMarks => DialogueOptionMarks.Bribe;

        /// <summary>Price for the current player and partner.</summary>
        /// <param name="stats">Player values (null = Charisma 10).</param>
        /// <param name="speakers">Speakers (null = greed 1).</param>
        /// <param name="npcId">Conversation partner.</param>
        public int PriceFor(IDialogueCheckStats stats, IDialogueSpeakerDirectory speakers, string npcId)
        {
            float greed = 1f;
            if (speakers != null && !string.IsNullOrEmpty(npcId) && speakers.TryGetSpeaker(npcId, out DialogueSpeakerInfo info))
            {
                greed = info.Greed;
            }

            int charisma = stats != null ? stats.GetAttribute(StatId.Charisma) : PlayerStatsCheckSource.DefaultAttribute;
            return BribePricing.Price(basePrice, greed, charisma);
        }

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            IServiceLocator services = ctx.Services;
            if (services == null || !services.TryGet(out IDialogueWallet wallet))
            {
                Log.Warning(LogCategory.Dialogue, "Bribe: no IDialogueWallet registered (source '" + ctx.SourceId + "').");
                return;
            }

            services.TryGet(out IDialogueCheckStats stats);
            services.TryGet(out IDialogueSpeakerDirectory speakers);
            int price = PriceFor(stats, speakers, ctx.TargetId);
            if (!wallet.TrySpendGold(price, ctx.SourceId))
            {
                Log.Warning(LogCategory.Dialogue, "Bribe: not enough gold for " + price + " (source '" + ctx.SourceId + "').");
            }
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Bestechen (" + basePrice + " Gold Grundpreis)";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequirePositive(basePrice, "Grundpreis");
        }
    }
}
