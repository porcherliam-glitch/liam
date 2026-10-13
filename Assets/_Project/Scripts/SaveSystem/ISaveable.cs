using System;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// A system that stores its state in the save game (§25: "Jedes System implementiert ein Interface ISaveable mit Save()
    /// und Load()", architecture 9.1). Register it with <see cref="ISaveManager.Register"/>.
    /// </summary>
    /// <remarks>
    /// <para><b>DTOs:</b> own classes per system, public fields allowed, only ids, numbers, strings, lists and
    /// <c>Dictionary&lt;string, …&gt;</c>; no Unity objects, ScriptableObjects, delegates, instance ids or CLR type names
    /// (checked by <see cref="SaveDtoValidator"/> on registration). Mark them <c>[Preserve]</c> (IL2CPP stripping).</para>
    /// <para><b>Save:</b> runs on the main thread and returns an independent snapshot; the game continues while it is
    /// serialized in the background. <b>Load:</b> only sets state, evaluates nothing and sends no gameplay events; follow-up
    /// work belongs into <see cref="IPostLoad.OnAfterLoad"/>.</para>
    /// </remarks>
    public interface ISaveable
    {
        /// <summary>Section name in the save file, e.g. <c>"quests"</c> (table 9.2). Never change it.</summary>
        string SaveKey { get; }

        /// <summary>Ascending load order (table 9.2: time 10 … player 110).</summary>
        int LoadOrder { get; }

        /// <summary>DTO type for deserialization (exactly the type returned by <see cref="Save"/>).</summary>
        Type DataType { get; }

        /// <summary>Main thread: returns an independent DTO snapshot of the current state.</summary>
        object Save();

        /// <summary>Sets the state from a DTO. <paramref name="data"/> is null for a new game or a save without this section.</summary>
        /// <param name="data">DTO of type <see cref="DataType"/>, or null for defaults.</param>
        /// <param name="ctx">Slot, versions and kind of load.</param>
        void Load(object data, in LoadContext ctx);
    }
}
