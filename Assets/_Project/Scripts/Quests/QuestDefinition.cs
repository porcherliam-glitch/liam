using System.Collections.Generic;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Quests
{
    /// <summary>
    /// A quest as data (§16.3, GDD 02 4.1, architecture 5.1 and 11.7): id, title, description, category and traits, twist
    /// type, recommended level, giver (with fallbacks) and turn-in NPC, start trigger and start conditions, stages with
    /// objectives, start stage (with conditional start stages), rewards, follow-up quests, repeat mode, fail rules, region,
    /// deadline, chain, decision ledger, companion reactions and production data. Lives in
    /// <c>Assets/_Project/Data/Quests/</c> and must be in the content catalog. Hundreds of quests are built only from such
    /// assets, without code (§16.1).
    /// </summary>
    /// <remarks>
    /// Read-only at run time: the quest service works with the copy from <see cref="CreateSpec"/>; the run-time state is a
    /// <see cref="QuestInstance"/>. Check assets with the menu "Aetherfall > Quests pruefen" (validator, GDD 02 10.2).
    /// TODO (localization step): title, descriptions and texts as LocalizedString (DE/EN).
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Quests/Quest", fileName = "Quest", order = 50)]
    public sealed class QuestDefinition : GameDefinition
    {
        [Header("Anzeige")]
        [Tooltip("Titel im Questlog, höchstens 32 Zeichen, z. B. „Die Wölfe vom Nordhang“.")]
        [SerializeField] private string title = string.Empty;

        [Tooltip("Kopftext im Questlog, 1–3 Sätze.")]
        [TextArea(2, 5)] [SerializeField] private string description = string.Empty;

        [Tooltip("Kategorie: bestimmt Questlog-Tab, Questgeber-Symbol und Belohnungsband (GDD 02, 2.2).")]
        [SerializeField] private QuestCategory category = QuestCategory.Side;

        [Tooltip("Merkmale: versteckt, zeitlich begrenzt, Kette, Notfall.")]
        [SerializeField] private QuestTraits traits = QuestTraits.None;

        [Tooltip("Twist-Typ aus dem Twist-Katalog (GDD 02, 1.4), z. B. verborgene_ursache.")]
        [SerializeField] private string twistType = string.Empty;

        [Tooltip("Empfohlenes Level.")]
        [Min(1)] [SerializeField] private int recommendedLevel = 1;

        [Tooltip("Region für Filter, Budget und Karte, z. B. region.eichental.")]
        [IdRef("region.")] [SerializeField] private string regionId = string.Empty;

        [Header("Start")]
        [Tooltip("Questgeber (NPC- oder Objekt-ID). Leer = Quest ohne Questgeber (automatisch, Item, Gebiet).")]
        [IdRef("npc.", true)] [SerializeField] private string giverId = string.Empty;

        [Tooltip("Ersatz-Questgeber in Reihenfolge, falls der Questgeber stirbt oder fehlt (GDD 02, 6.6).")]
        [SerializeField] private List<string> fallbackGiverIds = new List<string>();

        [Tooltip("Abgabe-NPC. Leer = Questgeber.")]
        [IdRef("npc.")] [SerializeField] private string turnInNpcId = string.Empty;

        [Tooltip("Wie die Quest beginnt: Dialog, Item aufheben, Gebiet betreten, Aushang, Weltereignis, automatisch.")]
        [SerializeField] private QuestStartTriggerKind startTriggerKind = QuestStartTriggerKind.Dialogue;

        [Tooltip("ID des Auslösers (Dialog-, Item-, Orts-ID …).")]
        [SerializeField] private string startTriggerId = string.Empty;

        [Tooltip("Startbedingungen (UND/ODER/NICHT über „Logik/…“). Leer = keine.")]
        [SerializeReference] private Condition startCondition;

        [Tooltip("Start-Stage. Leer = erste Stage der Liste.")]
        [SerializeField] private string startStageId = string.Empty;

        [Tooltip("Bedingte Start-Stages (mehrere Startwege): erste erfüllte gewinnt, sonst die Start-Stage.")]
        [SerializeField] private List<StageBranch> startBranches = new List<StageBranch>();

        [Header("Stages")]
        [Tooltip("Stages der Quest (s10, s20 …).")]
        [SerializeField] private List<StageDefinition> stages = new List<StageDefinition>();

        [Header("Belohnungen und Folgen")]
        [Tooltip("Belohnungen beim erfolgreichen Abschluss (Aktionen: Erfahrung, Gold, Items, Ruf …).")]
        [SerializeReference] private List<GameAction> rewards = new List<GameAction>();

        [Tooltip("Folgequests: angeboten oder automatisch gestartet.")]
        [SerializeField] private List<FollowUpQuest> followUps = new List<FollowUpQuest>();

        [Tooltip("Wiederholbar: nein, täglich, wöchentlich, mit Abklingzeit.")]
        [SerializeField] private QuestRepeatMode repeatMode = QuestRepeatMode.Never;

        [Tooltip("Abklingzeit in Stunden aktiver Spielzeit (nur „mit Abklingzeit“).")]
        [Min(0f)] [SerializeField] private float cooldownHours = 0f;

        [Header("Scheitern")]
        [Tooltip("Die Quest kann scheitern (Anzeige im Questlog).")]
        [SerializeField] private bool canFail = false;

        [Tooltip("Fehlschlag-Bedingungen auf Quest-Ebene und ihre Folge (Stage oder sofort gescheitert).")]
        [SerializeField] private List<QuestFailRule> failRules = new List<QuestFailRule>();

        [Tooltip("Frist in Spielstunden ab Annahme (Merkmal zeitlich begrenzt). 0 = keine. TODO: wirkt mit der Spieluhr.")]
        [Min(0f)] [SerializeField] private float deadlineHours = 0f;

        [Header("Kette und Entscheidungen")]
        [Tooltip("Ketten-ID, z. B. kette.eichental.muehlbach.")]
        [SerializeField] private string chainId = string.Empty;

        [Tooltip("Position in der Kette (1, 2 …). 0 = keine Kette.")]
        [Min(0)] [SerializeField] private int chainPosition = 0;

        [Tooltip("Ledger-Einträge (Entscheidungs-Zusammenfassung im Questlog, GDD 02 6.4).")]
        [SerializeField] private List<LedgerEntryDefinition> ledger = new List<LedgerEntryDefinition>();

        [Tooltip("Begleiter-Reaktionen je Ausgang (Daten, Wirkung folgt mit den Begleitern).")]
        [SerializeField] private List<CompanionReaction> companionReactions = new List<CompanionReaction>();

        [Header("Produktion")]
        [Tooltip("Erwartete Spielminute beim ersten Kontakt (Pacing).")]
        [Min(0)] [SerializeField] private int pacingMinute = 0;

        [Tooltip("Umfangsstufe A / B / C.")]
        [SerializeField] private QuestScopeTier scopeTier = QuestScopeTier.A;

        [Tooltip("Autor.")]
        [SerializeField] private string author = string.Empty;

        [Tooltip("Wortbudget (deutsche Wörter).")]
        [Min(0)] [SerializeField] private int wordBudget = 0;

        [Tooltip("Notizen.")]
        [TextArea(2, 6)] [SerializeField] private string notes = string.Empty;

        /// <summary>Title.</summary>
        public string Title => title;

        /// <summary>Category.</summary>
        public QuestCategory Category => category;

        /// <summary>Stages.</summary>
        public IReadOnlyList<StageDefinition> Stages => stages;

        /// <summary>Creates the read-only spec used by the quest service and the validator.</summary>
        public QuestSpec CreateSpec()
        {
            var builder = new QuestSpecBuilder(Id)
                .Title(title, description)
                .Category(category, traits)
                .Level(recommendedLevel, regionId, twistType)
                .Giver(giverId, turnInNpcId, fallbackGiverIds.ToArray())
                .StartTrigger(startTriggerKind, startTriggerId)
                .StartCondition(startCondition)
                .StartStage(startStageId)
                .Repeat(repeatMode, cooldownHours)
                .Deadline(deadlineHours)
                .Chain(chainId, chainPosition)
                .Production(Status, scopeTier, pacingMinute, author, wordBudget, notes)
                .AddStartBranches(startBranches)
                .AddStages(stages)
                .AddRewards(rewards)
                .AddFollowUps(followUps)
                .AddFailRules(failRules)
                .AddLedger(ledger)
                .AddReactions(companionReactions)
                .SetCanFail(canFail);
            return builder.Build();
        }
    }
}
