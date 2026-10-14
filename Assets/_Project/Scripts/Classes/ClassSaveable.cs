using System;
using Aetherfall.SaveSystem;

namespace Aetherfall.Classes
{
    /// <summary>Save data of the player's class (section <c>class</c>).</summary>
    [Serializable]
    public sealed class ClassDto
    {
        /// <summary>Class id, e.g. <c>class.magier</c>.</summary>
        public string ClassId = string.Empty;
    }

    /// <summary>Saves the class; loads before the inventory (50), so a new game gets the kit of the chosen class.</summary>
    public sealed class ClassSaveable : Saveable<ClassDto>
    {
        /// <summary>Section key.</summary>
        public const string Key = "class";

        /// <summary>Load order (before the inventory, 50).</summary>
        public const int Order = 45;

        private readonly ClassService _service;

        /// <summary>Creates the saveable.</summary>
        /// <param name="service">Class service.</param>
        public ClassSaveable(ClassService service) : base(Key, Order)
        {
            _service = service ?? throw new ArgumentNullException(nameof(service));
        }

        /// <inheritdoc />
        protected override ClassDto Capture()
        {
            return new ClassDto { ClassId = _service.Current.Id };
        }

        /// <inheritdoc />
        protected override void Restore(ClassDto data, in LoadContext ctx)
        {
            if (data == null && ctx.IsNewGame)
            {
                _service.StartNewGame();
                return;
            }

            _service.RestoreGame(data != null ? data.ClassId : string.Empty);
        }
    }
}
