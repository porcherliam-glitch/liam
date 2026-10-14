using System;
using Aetherfall.Conditions;
using Aetherfall.Core;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Everything the runner, the option analysis and the check evaluation share: event bus, service access for conditions and
    /// actions, the memory, the catalog (jumps), player values, gold, speakers, game day and rules. The speaker directory and the
    /// calendar are attached later (they are registered by installers after the dialogue installer).
    /// </summary>
    public sealed class DialogueRunContext
    {
        /// <summary>Creates the context.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="services">Service access for conditions and actions (may be null in tests without services).</param>
        /// <param name="memory">Conversation memory.</param>
        /// <param name="catalog">All dialogues (jumps).</param>
        /// <param name="stats">Player values for checks and prices (may be null = neutral values).</param>
        /// <param name="wallet">Gold (may be null = bribes are not possible).</param>
        /// <param name="rules">Rules (null = defaults).</param>
        /// <param name="badges">Option marking rules (null = defaults).</param>
        public DialogueRunContext(IEventBus bus, IServiceLocator services, DialogueMemory memory, DialogueCatalog catalog, IDialogueCheckStats stats,
            IDialogueWallet wallet, DialogueRules rules = null, DialogueBadgeRules badges = null)
        {
            Bus = bus ?? throw new ArgumentNullException(nameof(bus));
            Memory = memory ?? throw new ArgumentNullException(nameof(memory));
            Catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            Services = services;
            Stats = stats;
            Wallet = wallet;
            Rules = rules ?? new DialogueRules();
            Badges = badges ?? new DialogueBadgeRules();
        }

        /// <summary>Event bus.</summary>
        public IEventBus Bus { get; }

        /// <summary>Service access for conditions and actions (may be null).</summary>
        public IServiceLocator Services { get; }

        /// <summary>Conversation memory.</summary>
        public DialogueMemory Memory { get; }

        /// <summary>All dialogues.</summary>
        public DialogueCatalog Catalog { get; }

        /// <summary>Player values (may be null).</summary>
        public IDialogueCheckStats Stats { get; }

        /// <summary>Gold (may be null).</summary>
        public IDialogueWallet Wallet { get; }

        /// <summary>Rules.</summary>
        public DialogueRules Rules { get; }

        /// <summary>Option marking rules.</summary>
        public DialogueBadgeRules Badges { get; }

        /// <summary>Speakers (attached in PostInitialize; may be null).</summary>
        public IDialogueSpeakerDirectory Speakers { get; set; }

        /// <summary>Game day (attached later; may be null = day 0).</summary>
        public IDialogueCalendar Calendar { get; set; }

        /// <summary>Current game day (0 without calendar).</summary>
        public int CurrentDay => Calendar != null ? Calendar.CurrentDay : 0;

        /// <summary>Condition context: subject player, target the partner, source the dialogue.</summary>
        /// <param name="npcId">Conversation partner.</param>
        /// <param name="dialogueId">Evaluating dialogue.</param>
        public ConditionContext ConditionContextFor(string npcId, string dialogueId)
        {
            return new ConditionContext(Services, SubjectIds.Player, npcId, dialogueId);
        }

        /// <summary>Action context: subject player, target the partner, source the dialogue.</summary>
        /// <param name="npcId">Conversation partner.</param>
        /// <param name="dialogueId">Running dialogue.</param>
        public ActionContext ActionContextFor(string npcId, string dialogueId)
        {
            return new ActionContext(Services, SubjectIds.Player, npcId, dialogueId);
        }

        /// <summary>Returns the data of a speaker.</summary>
        /// <param name="speakerId">NPC id.</param>
        /// <param name="info">Data.</param>
        public bool TryGetSpeaker(string speakerId, out DialogueSpeakerInfo info)
        {
            if (Speakers != null && !string.IsNullOrEmpty(speakerId))
            {
                try
                {
                    return Speakers.TryGetSpeaker(speakerId, out info);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Dialogue, exception, "Speaker lookup failed for '" + speakerId + "'");
                }
            }

            info = default;
            return false;
        }

        /// <summary>
        /// Shown name of a speaker (GDD 02, 12.7): the name once known (from the start or by "Name bekannt"), otherwise the role;
        /// the id if the NPC is unknown.
        /// </summary>
        /// <param name="speakerId">NPC id.</param>
        public string SpeakerName(string speakerId)
        {
            if (string.IsNullOrEmpty(speakerId))
            {
                return string.Empty;
            }

            if (!TryGetSpeaker(speakerId, out DialogueSpeakerInfo info))
            {
                return speakerId;
            }

            bool known = info.NameKnownFromStart || Memory.HasName(speakerId);
            if (known && info.Name.Length > 0)
            {
                return info.Name;
            }

            return info.Role.Length > 0 ? info.Role : info.Name.Length > 0 ? info.Name : speakerId;
        }
    }
}
