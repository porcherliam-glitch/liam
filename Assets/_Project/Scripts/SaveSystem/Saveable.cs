using System;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// Type-safe base class for <see cref="ISaveable"/> (architecture 9.1): implement <see cref="Capture"/> and
    /// <see cref="Restore"/> with the DTO type instead of <c>object</c>.
    /// </summary>
    /// <typeparam name="TDto">DTO class (public parameterless constructor, see <see cref="SaveDtoValidator"/>).</typeparam>
    public abstract class Saveable<TDto> : ISaveable where TDto : class, new()
    {
        /// <summary>Creates the saveable.</summary>
        /// <param name="saveKey">Section name (never change it).</param>
        /// <param name="loadOrder">Load order (table 9.2).</param>
        protected Saveable(string saveKey, int loadOrder)
        {
            if (string.IsNullOrEmpty(saveKey))
            {
                throw new ArgumentException("A save key is required.", nameof(saveKey));
            }

            SaveKey = saveKey;
            LoadOrder = loadOrder;
        }

        /// <inheritdoc />
        public string SaveKey { get; }

        /// <inheritdoc />
        public int LoadOrder { get; }

        /// <inheritdoc />
        public Type DataType => typeof(TDto);

        /// <inheritdoc />
        public object Save()
        {
            return Capture();
        }

        /// <inheritdoc />
        public void Load(object data, in LoadContext ctx)
        {
            if (data != null && !(data is TDto))
            {
                throw new ArgumentException("Section '" + SaveKey + "' expects " + typeof(TDto).Name + " but got " + data.GetType().Name + ".", nameof(data));
            }

            Restore(data as TDto, ctx);
        }

        /// <summary>Main thread: returns a new DTO with the current state (never a shared instance).</summary>
        protected abstract TDto Capture();

        /// <summary>Sets the state. <paramref name="data"/> is null for a new game or a missing section: apply defaults.</summary>
        /// <param name="data">DTO or null.</param>
        /// <param name="ctx">Load context.</param>
        protected abstract void Restore(TDto data, in LoadContext ctx);
    }
}
