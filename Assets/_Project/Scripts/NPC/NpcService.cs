using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Dialogue;
using Aetherfall.Events;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Default <see cref="INpcService"/>, also the <see cref="IDialogueSpeakerDirectory"/> of the dialogues (names, roles,
    /// levels, greed). Pure logic: relationship per NPC (start value from the data, changes clamped to -100 .. +100, event
    /// <c>RelationshipChanged</c>), alive or dead (<c>NPCDied</c>), hostile NPCs and groups. Saved through
    /// <see cref="NpcSaveable"/>; loading sets the state without events.
    /// </summary>
    public sealed class NpcService : INpcService, IDialogueSpeakerDirectory
    {
        private readonly IEventBus _bus;
        private readonly Dictionary<string, int> _relationships = new Dictionary<string, int>(StringComparer.Ordinal);
        private readonly HashSet<string> _dead = new HashSet<string>(StringComparer.Ordinal);
        private readonly HashSet<string> _hostile = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>Creates the service.</summary>
        /// <param name="bus">Event bus.</param>
        /// <param name="catalog">All NPCs.</param>
        public NpcService(IEventBus bus, NpcCatalog catalog)
        {
            _bus = bus ?? throw new ArgumentNullException(nameof(bus));
            Catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
        }

        /// <inheritdoc />
        public event Action<string, bool> HostilityChanged;

        /// <inheritdoc />
        public NpcCatalog Catalog { get; }

        /// <inheritdoc />
        public bool TryGetSpeaker(string speakerId, out DialogueSpeakerInfo info)
        {
            if (Catalog.TryGet(speakerId, out NpcSpec spec))
            {
                info = new DialogueSpeakerInfo(spec.Name, spec.Role, spec.NameKnownFromStart, spec.Level, spec.Greed, spec.Unbribable,
                    GetRelationship(speakerId));
                return true;
            }

            info = default;
            return false;
        }

        /// <inheritdoc />
        public int GetRelationship(string npcId)
        {
            if (npcId != null && _relationships.TryGetValue(npcId, out int value))
            {
                return value;
            }

            return Catalog.TryGet(npcId, out NpcSpec spec) ? spec.StartRelationship : 0;
        }

        /// <summary>Tier of the relationship of an NPC.</summary>
        /// <param name="npcId">NPC id.</param>
        public RelationshipTier GetTier(string npcId)
        {
            return RelationshipRules.TierOf(GetRelationship(npcId));
        }

        /// <inheritdoc />
        public int ChangeRelationship(string npcId, int delta, string sourceId)
        {
            if (string.IsNullOrEmpty(npcId))
            {
                return 0;
            }

            int old = GetRelationship(npcId);
            int value = RelationshipRules.Clamp(old + delta);
            if (value == old)
            {
                return value;
            }

            _relationships[npcId] = value;
            Log.Debug(LogCategory.NPC, "Relationship " + npcId + ": " + old + " -> " + value + " (" + (sourceId ?? string.Empty) + ")");
            _bus.Publish(new RelationshipChanged(npcId, old, value));
            return value;
        }

        /// <inheritdoc />
        public bool IsAlive(string npcId)
        {
            return npcId == null || !_dead.Contains(npcId);
        }

        /// <inheritdoc />
        public bool MarkDead(string npcId, string killerId)
        {
            if (string.IsNullOrEmpty(npcId) || !_dead.Add(npcId))
            {
                return false;
            }

            Log.Info(LogCategory.NPC, "NPC died: " + npcId + " (by '" + (killerId ?? string.Empty) + "').");
            _bus.Publish(new NPCDied(npcId, killerId));
            return true;
        }

        /// <inheritdoc />
        public bool IsHostile(string id)
        {
            if (id == null)
            {
                return false;
            }

            return _hostile.Contains(id) || (Catalog.TryGet(id, out NpcSpec spec) && spec.GroupId.Length > 0 && _hostile.Contains(spec.GroupId));
        }

        /// <inheritdoc />
        public void SetHostile(string id, bool hostile, string sourceId)
        {
            if (string.IsNullOrEmpty(id))
            {
                return;
            }

            bool changed = hostile ? _hostile.Add(id) : _hostile.Remove(id);
            if (!changed)
            {
                return;
            }

            Log.Info(LogCategory.NPC, id + (hostile ? " is hostile" : " is peaceful") + " (" + (sourceId ?? string.Empty) + ").");
            HostilityChanged?.Invoke(id, hostile);
        }

        /// <summary>Copies the state into a new DTO (only changed NPCs; sorted for stable save files).</summary>
        public NpcsDto Capture()
        {
            var ids = new HashSet<string>(_relationships.Keys, StringComparer.Ordinal);
            ids.UnionWith(_dead);
            var sorted = new List<string>(ids);
            sorted.Sort(string.CompareOrdinal);
            var dto = new NpcsDto();
            for (int i = 0; i < sorted.Count; i++)
            {
                string id = sorted[i];
                dto.Npcs.Add(new NpcStateDto { Id = id, Relationship = GetRelationship(id), Alive = !_dead.Contains(id) });
            }

            dto.Hostile.AddRange(_hostile);
            dto.Hostile.Sort(string.CompareOrdinal);
            return dto;
        }

        /// <summary>Replaces the state with a DTO without events (null = new game: start values).</summary>
        /// <param name="dto">DTO or null.</param>
        public void Restore(NpcsDto dto)
        {
            _relationships.Clear();
            _dead.Clear();
            _hostile.Clear();
            if (dto == null)
            {
                return;
            }

            if (dto.Npcs != null)
            {
                for (int i = 0; i < dto.Npcs.Count; i++)
                {
                    NpcStateDto entry = dto.Npcs[i];
                    if (entry == null || string.IsNullOrEmpty(entry.Id))
                    {
                        continue;
                    }

                    _relationships[entry.Id] = RelationshipRules.Clamp(entry.Relationship);
                    if (!entry.Alive)
                    {
                        _dead.Add(entry.Id);
                    }
                }
            }

            if (dto.Hostile != null)
            {
                for (int i = 0; i < dto.Hostile.Count; i++)
                {
                    if (!string.IsNullOrEmpty(dto.Hostile[i]))
                    {
                        _hostile.Add(dto.Hostile[i]);
                    }
                }
            }
        }
    }
}
