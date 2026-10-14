using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.SaveSystem;
using Aetherfall.Stats;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Saves and restores the section <c>progression</c> (architecture 9.2, load order 40) and writes the level into the save
    /// header (preview "Level 14", GDD 05 5.5). A new game (data null) starts at the start level of the service (1 in the
    /// game) without experience and points.
    /// </summary>
    public sealed class ProgressionSaveable : Saveable<ProgressionDto>, ISaveHeaderContributor
    {
        /// <summary>Save key (table 9.2).</summary>
        public const string Key = "progression";

        /// <summary>Load order (table 9.2).</summary>
        public const int Order = 40;

        private readonly ProgressionService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Progression service.</param>
        public ProgressionSaveable(ProgressionService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        public void Contribute(SaveHeader header)
        {
            if (header != null && header.Character != null)
            {
                header.Character.Level = _service.Level;
            }
        }

        /// <inheritdoc />
        protected override ProgressionDto Capture()
        {
            var dto = new ProgressionDto
            {
                Level = _service.Level,
                XpIntoLevel = _service.XpIntoLevel,
                TotalXp = _service.TotalXp,
                UnspentAttributePoints = _service.UnspentAttributePoints,
                UnspentSkillPoints = _service.UnspentSkillPoints,
                BonusSkillPoints = _service.BonusSkillPoints
            };
            List<KeyValuePair<StatId, int>> spent = _service.CaptureSpentPoints();
            for (int i = 0; i < spent.Count; i++)
            {
                dto.Attributes.Add(new AttributePointsDto { Attribute = spent[i].Key.ToString(), Points = spent[i].Value });
            }

            return dto;
        }

        /// <inheritdoc />
        protected override void Restore(ProgressionDto data, in LoadContext ctx)
        {
            if (data == null)
            {
                _service.ResetToNewGame();
                return;
            }

            var spent = new List<KeyValuePair<StatId, int>>();
            if (data.Attributes != null)
            {
                for (int i = 0; i < data.Attributes.Count; i++)
                {
                    AttributePointsDto entry = data.Attributes[i];
                    if (entry == null)
                    {
                        continue;
                    }

                    if (!Enum.TryParse(entry.Attribute, false, out StatId attribute) || !StatIds.IsAttribute(attribute))
                    {
                        Log.Warning(LogCategory.Save, "progression: unknown attribute '" + entry.Attribute + "' with " + entry.Points + " point(s) ignored.");
                        continue;
                    }

                    spent.Add(new KeyValuePair<StatId, int>(attribute, entry.Points));
                }
            }

            _service.LoadState(data.Level, data.XpIntoLevel, data.UnspentAttributePoints, data.UnspentSkillPoints, data.BonusSkillPoints, spent);
        }
    }
}
