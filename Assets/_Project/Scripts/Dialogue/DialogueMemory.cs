using System;
using System.Collections.Generic;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// The data behind <see cref="IDialogueMemory"/>: sets of chosen option keys, known topics and known names, and the
    /// remembered check results by node key (<see cref="DialogueIds"/>). Pure data with copy in/out for the saveable; sends no
    /// events (the service does).
    /// </summary>
    public sealed class DialogueMemory
    {
        private readonly HashSet<string> _chosen = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _topics = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _names = new HashSet<string>(StringComparer.Ordinal);
        private readonly Dictionary<string, bool> _checks = new Dictionary<string, bool>(StringComparer.Ordinal);

        /// <summary>Number of chosen options.</summary>
        public int ChosenCount => _chosen.Count;

        /// <summary>Number of remembered checks.</summary>
        public int CheckCount => _checks.Count;

        /// <summary>Marks an option as chosen.</summary>
        /// <param name="optionKey">Option key <c>&lt;dialogue&gt;.&lt;node&gt;.&lt;option&gt;</c>.</param>
        /// <returns>True if it was new.</returns>
        public bool MarkChosen(string optionKey)
        {
            return !string.IsNullOrEmpty(optionKey) && _chosen.Add(optionKey);
        }

        /// <summary>True if the option was chosen.</summary>
        /// <param name="optionKey">Option key.</param>
        public bool IsChosen(string optionKey)
        {
            return optionKey != null && _chosen.Contains(optionKey);
        }

        /// <summary>Stores a check result.</summary>
        /// <param name="nodeKey">Node key <c>&lt;dialogue&gt;.&lt;node&gt;</c>.</param>
        /// <param name="success">Result.</param>
        public void SetCheck(string nodeKey, bool success)
        {
            if (!string.IsNullOrEmpty(nodeKey))
            {
                _checks[nodeKey] = success;
            }
        }

        /// <summary>Returns a stored check result.</summary>
        /// <param name="nodeKey">Node key.</param>
        /// <param name="success">Result.</param>
        public bool TryGetCheck(string nodeKey, out bool success)
        {
            if (nodeKey != null && _checks.TryGetValue(nodeKey, out success))
            {
                return true;
            }

            success = false;
            return false;
        }

        /// <summary>Adds a topic.</summary>
        /// <param name="topicId">Topic id.</param>
        /// <returns>True if it was new.</returns>
        public bool AddTopic(string topicId)
        {
            return !string.IsNullOrEmpty(topicId) && _topics.Add(topicId);
        }

        /// <summary>True if the topic is known.</summary>
        /// <param name="topicId">Topic id.</param>
        public bool HasTopic(string topicId)
        {
            return topicId != null && _topics.Contains(topicId);
        }

        /// <summary>Adds a known name.</summary>
        /// <param name="speakerId">NPC id.</param>
        /// <returns>True if it was new.</returns>
        public bool AddName(string speakerId)
        {
            return !string.IsNullOrEmpty(speakerId) && _names.Add(speakerId);
        }

        /// <summary>True if the name is known.</summary>
        /// <param name="speakerId">NPC id.</param>
        public bool HasName(string speakerId)
        {
            return speakerId != null && _names.Contains(speakerId);
        }

        /// <summary>Known topics, sorted.</summary>
        public List<string> SortedTopics()
        {
            return Sorted(_topics);
        }

        /// <summary>Forgets everything (new game, before loading).</summary>
        public void Clear()
        {
            _chosen.Clear();
            _topics.Clear();
            _names.Clear();
            _checks.Clear();
        }

        /// <summary>Copies the state into a new DTO (sorted, so save files stay stable).</summary>
        public DialogueDto Capture()
        {
            var dto = new DialogueDto
            {
                ChosenOptions = Sorted(_chosen),
                Topics = Sorted(_topics),
                KnownNames = Sorted(_names)
            };

            var keys = new List<string>(_checks.Keys);
            keys.Sort(string.CompareOrdinal);
            for (int i = 0; i < keys.Count; i++)
            {
                dto.CheckResults.Add(new DialogueCheckResultDto { Key = keys[i], Success = _checks[keys[i]] });
            }

            return dto;
        }

        /// <summary>Replaces the state with a DTO (null = empty, new game).</summary>
        /// <param name="dto">DTO or null.</param>
        public void Load(DialogueDto dto)
        {
            Clear();
            if (dto == null)
            {
                return;
            }

            AddAll(_chosen, dto.ChosenOptions);
            AddAll(_topics, dto.Topics);
            AddAll(_names, dto.KnownNames);
            if (dto.CheckResults != null)
            {
                for (int i = 0; i < dto.CheckResults.Count; i++)
                {
                    DialogueCheckResultDto entry = dto.CheckResults[i];
                    if (entry != null && !string.IsNullOrEmpty(entry.Key))
                    {
                        _checks[entry.Key] = entry.Success;
                    }
                }
            }
        }

        private static void AddAll(HashSet<string> target, List<string> source)
        {
            if (source == null)
            {
                return;
            }

            for (int i = 0; i < source.Count; i++)
            {
                if (!string.IsNullOrEmpty(source[i]))
                {
                    target.Add(source[i]);
                }
            }
        }

        private static List<string> Sorted(HashSet<string> set)
        {
            var list = new List<string>(set);
            list.Sort(string.CompareOrdinal);
            return list;
        }
    }
}
