using System;
using Aetherfall.Conditions;
using Aetherfall.Core;
using Aetherfall.Data;
using UnityEngine;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// Action "Inszenierung/Zwischensequenz" (GDD 02 notation <c>Szene(id)</c>, architecture 7.1 "PlayCutscene"): asks for a
    /// cutscene, e.g. when a quest stage begins. Returns at once; the cutscene starts when the game allows it (it waits for the
    /// end of a load or a fight). Without the cutscene service nothing happens (logged).
    /// </summary>
    [Serializable]
    [TypeMenu("Inszenierung/Zwischensequenz", 1)]
    public sealed class PlayCutscene : GameAction
    {
        [Tooltip("Zwischensequenz-ID (cs.…).")]
        [IdRef("cs.")] [SerializeField] private string cutsceneId = string.Empty;

        /// <summary>Creates an empty action (inspector).</summary>
        public PlayCutscene()
        {
        }

        /// <summary>Creates the action.</summary>
        /// <param name="cutsceneId">Cutscene id.</param>
        public PlayCutscene(string cutsceneId)
        {
            this.cutsceneId = cutsceneId ?? string.Empty;
        }

        /// <summary>Cutscene id.</summary>
        public string CutsceneId => cutsceneId ?? string.Empty;

        /// <inheritdoc />
        public override void Execute(in ActionContext ctx)
        {
            if (ctx.Services == null || !ctx.Services.TryGet(out ICutsceneService cutscenes))
            {
                Log.Warning(LogCategory.Cinematics, "PlayCutscene: no ICutsceneService (CinematicsInstaller missing in the BootConfig) – '" +
                                                    CutsceneId + "' not played.");
                return;
            }

            cutscenes.Request(CutsceneId, ctx.SourceId);
        }

        /// <inheritdoc />
        public override string Describe()
        {
            return "Zwischensequenz " + (CutsceneId.Length > 0 ? CutsceneId : "?") + " abspielen";
        }

        /// <inheritdoc />
        public override void Validate(IValidationReport report)
        {
            report.RequireId(cutsceneId, CutsceneIds.Prefix, "Zwischensequenz-ID");
        }
    }
}
