using System.Runtime.CompilerServices;

// Test assemblies may access internal members of Aetherfall.Core (e.g. Services.Set / Services.Reset).
// Production assemblies must only use the public API.
[assembly: InternalsVisibleTo("Aetherfall.Tests.EditMode")]
[assembly: InternalsVisibleTo("Aetherfall.Tests.PlayMode")]
