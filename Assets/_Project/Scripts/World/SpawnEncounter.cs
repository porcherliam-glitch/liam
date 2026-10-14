using System;
using Aetherfall.Conditions;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Action "Gegner spawnen" (architecture 7.7 <c>SpawnEncounter</c>, GDD 02 short code <c>Gegner+(spawn-id)</c>): switches on
    /// the enemy group of a spawner in the scene, e.g. <c>spawn.eichental.nordhang_rudel</c> at the start of quest 2, stage s20.
    /// The <see cref="ISpawnGroupRegistry"/> remembers it (also over saving and loading).
    /// </summary>
    /// <remarks>Only the variant "spawn definition" exists so far; "enemy type + count + place" follows with the open world.</remarks>
    [Serializable]
    [TypeMenu("Welt/Gegner spawnen", 0)]
    public sealed class SpawnEncounter : GameAction
    {
        [Tooltip("Spawner-ID der Gegnergruppe, z. B. spawn.eichental.nordhang_rudel.")]
        [IdRef("spawn.")] [SerializeField] private string spawnId = string.Empty;

        /// <summary>Creates an empty action.</summary>
        public SpawnEncounter()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="spawnId">Spawner id.</param>
        public SpawnEncounter(string spawnId)
        {
            this.spawnId = spawnId ?? string.Empty;
        }

        /// <summary>Spawner id.</summary>
        public string SpawnId => spawnId ?? string.Empty;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            ctx.Get<ISpawnGroupRegistry>().Activate(SpawnId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Gegner+(" + (SpawnId.Length > 0 ? SpawnId : "?") + ")";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(spawnId, "spawn.", "Spawner");
        }
    }
}
