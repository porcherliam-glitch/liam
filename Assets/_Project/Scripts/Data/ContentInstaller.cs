using System;
using System.Collections.Generic;
using Aetherfall.Core;
using UnityEngine;

namespace Aetherfall.Data
{
    /// <summary>
    /// Registers <see cref="IContentDatabase"/> (<see cref="ContentDatabase"/>) with all definitions of the assigned
    /// <see cref="ContentCatalog"/>s (architecture 4.1, step 7 "ContentDatabase"). Needs no other service.
    /// </summary>
    /// <remarks>
    /// Asset: <c>Assets/_Project/Settings/Boot/ContentInstaller.asset</c>; the menu "Aetherfall > Testgelaende erstellen"
    /// (German menu text) puts it into the BootConfig behind the Input installer and fills the catalog.
    /// </remarks>
    [CreateAssetMenu(menuName = "Aetherfall/Boot/Installer: Inhalte", fileName = "ContentInstaller", order = 103)]
    public sealed class ContentInstaller : ServiceInstaller
    {
        [Tooltip("Kataloge mit allen Definitionen (Items, Affixe, Loot-Tabellen). Das Testgelände-Menü trägt Assets/_Project/Data/ContentCatalog.asset ein.")]
        [SerializeField] private List<ContentCatalog> catalogs = new List<ContentCatalog>();

        /// <inheritdoc />
        public override IEnumerable<Type> Provides => new[] { typeof(IContentDatabase) };

        /// <inheritdoc />
        public override void Install(IServiceRegistry registry, IServiceLocator locator)
        {
            var database = new ContentDatabase();
            int catalogCount = 0;
            for (int i = 0; i < catalogs.Count; i++)
            {
                ContentCatalog catalog = catalogs[i];
                if (catalog == null)
                {
                    continue;
                }

                catalogCount++;
                database.RegisterAll(catalog.Definitions);
            }

            if (catalogCount == 0)
            {
                Log.Warning(LogCategory.Data, "ContentInstaller has no catalog: the content database is empty " +
                                              "(menu Aetherfall > Testgelaende erstellen fills Assets/_Project/Data/ContentCatalog.asset).");
            }

            Log.Info(LogCategory.Data, "Content database: " + database.Count + " definitions from " + catalogCount + " catalog(s).");
            registry.Register<IContentDatabase>(database);
        }
    }
}
