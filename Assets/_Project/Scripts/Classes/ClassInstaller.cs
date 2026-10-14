using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Inventory;
using Aetherfall.SaveSystem;
using UnityEngine;

namespace Aetherfall.Classes
{
    /// <summary>
    /// Registers <see cref="IClassService"/> with the classes of the list (the first one is the default) and its save section
    /// <c>class</c>. Needs the inventory (starting kit of the class).
    /// </summary>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Klassen", fileName = "ClassInstaller", order = 113)]
    public sealed class ClassInstaller : ServiceInstaller
    {
        [Tooltip("Klassen in der Reihenfolge der Klassenwahl; die erste ist der Standard (Krieger).")]
        [SerializeField] private List<ClassDefinition> classes = new List<ClassDefinition>();

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IClassService) };

        /// <inheritdoc />
        public override IEnumerable<Type> Requires => new[] { typeof(IInventoryService), typeof(ISaveManager) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var specs = new List<ClassSpec>();
            foreach (ClassDefinition definition in classes)
            {
                if (definition != null)
                {
                    specs.Add(definition.CreateSpec());
                }
            }

            var service = new ClassService(specs, locator.Get<IInventoryService>());
            locator.Get<ISaveManager>().Register(new ClassSaveable(service));
            Log.Info(LogCategory.Data, "Classes: " + service.Classes.Count + " (default " + service.Pending.Id + ").");
            registry.Register<IClassService>(service);
        }
    }
}
