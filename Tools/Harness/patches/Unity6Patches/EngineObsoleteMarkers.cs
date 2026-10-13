// HARNESS ONLY. APIs that Unity 6.3 marks [Obsolete] (checked against the Unity 6000.3
// C# reference source). The harness puts the same markers on its 2021.3 references so
// that their use produces CS0618 warnings as in Unity 6.3.
using Harness.Unity6Patches;

[assembly: MarkObsolete("UnityEngine.CoreModule", "UnityEngine.Object", "FindObjectOfType",
    "[Unity 6.3] Object.FindObjectOfType is obsolete. Use FindFirstObjectByType or FindAnyObjectByType (project rule: no Find* in runtime code).", false)]
[assembly: MarkObsolete("UnityEngine.CoreModule", "UnityEngine.Object", "FindObjectsOfType",
    "[Unity 6.3] Object.FindObjectsOfType is obsolete. Use FindObjectsByType (project rule: no Find* in runtime code).", false)]
[assembly: MarkObsolete("UnityEngine.CoreModule", "UnityEngine.Object", "FindSceneObjectsOfType",
    "[Unity 6.3] Object.FindSceneObjectsOfType is obsolete. Use FindObjectsByType.", false)]
[assembly: MarkObsolete("UnityEngine.PhysicsModule", "UnityEngine.Rigidbody", "velocity",
    "[Unity 6.3] Rigidbody.velocity is obsolete. Use Rigidbody.linearVelocity.", false)]
[assembly: MarkObsolete("UnityEngine.PhysicsModule", "UnityEngine.Rigidbody", "drag",
    "[Unity 6.3] Rigidbody.drag is obsolete. Use Rigidbody.linearDamping.", false)]
[assembly: MarkObsolete("UnityEngine.PhysicsModule", "UnityEngine.Rigidbody", "angularDrag",
    "[Unity 6.3] Rigidbody.angularDrag is obsolete. Use Rigidbody.angularDamping.", false)]
[assembly: MarkObsolete("UnityEngine.CoreModule", "UnityEngine.Rendering.GraphicsSettings", "renderPipelineAsset",
    "[Unity 6.3] GraphicsSettings.renderPipelineAsset is obsolete. Use GraphicsSettings.defaultRenderPipeline.", false)]
