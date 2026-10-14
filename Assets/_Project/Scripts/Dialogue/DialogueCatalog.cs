using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// All dialogues by id as <see cref="DialogueSpec"/>s. Built once at boot from the <see cref="DialogueDefinition"/>s of the
    /// content database; tests build it from specs. Duplicate ids: the first wins (logged; the validator reports V01).
    /// </summary>
    public sealed class DialogueCatalog
    {
        private readonly Dictionary<string, DialogueSpec> _specs = new Dictionary<string, DialogueSpec>(StringComparer.Ordinal);
        private readonly List<DialogueSpec> _all = new List<DialogueSpec>();

        /// <summary>Number of dialogues.</summary>
        public int Count => _all.Count;

        /// <summary>All dialogues in registration order.</summary>
        public IReadOnlyList<DialogueSpec> All => _all;

        /// <summary>Builds the catalog from all dialogue definitions of the content database.</summary>
        /// <param name="database">Content database (null = empty).</param>
        public static DialogueCatalog FromDatabase(IContentDatabase database)
        {
            var catalog = new DialogueCatalog();
            if (database == null)
            {
                return catalog;
            }

            IReadOnlyList<DialogueDefinition> definitions = database.GetAll<DialogueDefinition>();
            for (int i = 0; i < definitions.Count; i++)
            {
                if (definitions[i] != null)
                {
                    catalog.Add(definitions[i].CreateSpec());
                }
            }

            return catalog;
        }

        /// <summary>Builds the catalog from specs.</summary>
        /// <param name="specs">Specs.</param>
        public static DialogueCatalog FromSpecs(params DialogueSpec[] specs)
        {
            var catalog = new DialogueCatalog();
            if (specs != null)
            {
                for (int i = 0; i < specs.Length; i++)
                {
                    catalog.Add(specs[i]);
                }
            }

            return catalog;
        }

        /// <summary>Adds a dialogue; empty or duplicate ids are rejected with a log entry.</summary>
        /// <param name="spec">Spec.</param>
        public bool Add(DialogueSpec spec)
        {
            if (spec == null || spec.Id.Length == 0)
            {
                Log.Warning(LogCategory.Dialogue, "DialogueCatalog: dialogue without id ignored.");
                return false;
            }

            if (_specs.ContainsKey(spec.Id))
            {
                Log.Error(LogCategory.Dialogue, "DialogueCatalog: duplicate dialogue id '" + spec.Id + "', the first definition wins.");
                return false;
            }

            _specs.Add(spec.Id, spec);
            _all.Add(spec);
            return true;
        }

        /// <summary>Returns a dialogue.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        /// <param name="spec">The spec.</param>
        public bool TryGet(string dialogueId, out DialogueSpec spec)
        {
            if (dialogueId != null && _specs.TryGetValue(dialogueId, out spec))
            {
                return true;
            }

            spec = null;
            return false;
        }

        /// <summary>True if the dialogue exists.</summary>
        /// <param name="dialogueId">Dialogue id.</param>
        public bool Contains(string dialogueId)
        {
            return dialogueId != null && _specs.ContainsKey(dialogueId);
        }
    }
}
