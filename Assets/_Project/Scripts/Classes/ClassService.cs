using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Inventory;

namespace Aetherfall.Classes
{
    /// <summary>
    /// Default <see cref="IClassService"/>: the classes of the content database, the class of the running game and the class of
    /// the next new game. Choosing a class also sets the starting kit of the inventory, so the new game starts with the kit of
    /// the class (GDD 03 11.2). Saved in the section <c>class</c> (<see cref="ClassSaveable"/>, before the inventory).
    /// </summary>
    public sealed class ClassService : IClassService
    {
        private readonly List<ClassSpec> _classes = new List<ClassSpec>();
        private readonly IInventoryService _inventory;

        /// <summary>Creates the service.</summary>
        /// <param name="classes">Classes (the first one is the default, e.g. the warrior).</param>
        /// <param name="inventory">Inventory (starting kit); may be null in tests.</param>
        public ClassService(IEnumerable<ClassSpec> classes, IInventoryService inventory)
        {
            _inventory = inventory;
            if (classes != null)
            {
                foreach (ClassSpec spec in classes)
                {
                    if (spec != null && spec.Id.Length > 0 && Find(spec.Id) == null)
                    {
                        _classes.Add(spec);
                    }
                }
            }

            if (_classes.Count == 0)
            {
                _classes.Add(new ClassSpec("class.krieger", "Krieger", string.Empty, string.Empty, null, null));
            }

            Pending = _classes[0];
            Current = _classes[0];
        }

        /// <inheritdoc />
        public IReadOnlyList<ClassSpec> Classes => _classes;

        /// <inheritdoc />
        public ClassSpec Current { get; private set; }

        /// <inheritdoc />
        public ClassSpec Pending { get; private set; }

        /// <inheritdoc />
        public event Action<ClassSpec, bool> Changed;

        /// <inheritdoc />
        public bool ChooseForNewGame(string classId)
        {
            ClassSpec spec = Find(classId);
            if (spec == null)
            {
                Log.Warning(LogCategory.Data, "Class '" + classId + "' is unknown; the new game keeps " + Pending.Id + ".");
                return false;
            }

            Pending = spec;
            ApplyKit(spec);

            return true;
        }

        /// <summary>A new game starts: the chosen class becomes the class of the game (save loader, before the inventory).</summary>
        public void StartNewGame()
        {
            Current = Pending;
            ApplyKit(Current);

            Log.Info(LogCategory.Data, "New game as " + Current.Name + " (" + Current.Id + ").");
            Changed?.Invoke(Current, true);
        }

        /// <summary>A game was loaded: its class (saves without a class are warriors, the class of the slice before the choice).</summary>
        /// <param name="classId">Saved class id (empty = default).</param>
        public void RestoreGame(string classId)
        {
            Current = Find(classId) ?? _classes[0];
            Changed?.Invoke(Current, false);
        }

        private void ApplyKit(ClassSpec spec)
        {
            // A class without kit (test ground) keeps the starting kit of the inventory installer.
            if (_inventory != null && spec.Kit.Items.Count > 0)
            {
                _inventory.SetStartingKit(spec.Kit);
            }
        }

        /// <summary>The class with this id, or null.</summary>
        /// <param name="classId">Class id.</param>
        public ClassSpec Find(string classId)
        {
            for (int i = 0; i < _classes.Count; i++)
            {
                if (_classes[i].Id == classId)
                {
                    return _classes[i];
                }
            }

            return null;
        }
    }
}
