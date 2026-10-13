using System;
using System.Threading;
using Aetherfall.Events;
using UnityEngine;

namespace Aetherfall.SaveSystem
{
    /// <summary>Quick save and quick load (GDD 05 5.4) on top of <see cref="ISaveManager"/>.</summary>
    public static class SaveManagerExtensions
    {
        /// <summary>Quick save into the next of the 3 rotating slots <c>quick_0..2</c>.</summary>
        /// <param name="manager">Save manager.</param>
        /// <param name="ct">Cancellation.</param>
        public static Awaitable<SaveResult> QuickSaveAsync(this ISaveManager manager, CancellationToken ct)
        {
            return manager.SaveAsync(SaveRequest.Quick(), ct);
        }

        /// <summary>Loads the newest quick save of the current character.</summary>
        /// <param name="manager">Save manager.</param>
        /// <param name="ct">Cancellation.</param>
        /// <returns>The load result; fails with <see cref="SaveReasonKeys.NoQuickSave"/> if there is none.</returns>
        public static Awaitable<LoadResult> QuickLoadAsync(this ISaveManager manager, CancellationToken ct)
        {
            if (manager.TryGetLatestSlot(SaveKind.Quick, out SaveSlotInfo slot))
            {
                return manager.LoadAsync(slot.SlotId, ct);
            }

            var source = new AwaitableCompletionSource<LoadResult>();
            source.SetResult(new LoadResult(false, string.Empty, 0, false, SaveReasonKeys.NoQuickSave, "There is no quick save yet.", DateTime.UtcNow));
            return source.Awaitable;
        }
    }
}
