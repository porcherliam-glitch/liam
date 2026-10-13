using UnityEngine.InputSystem;

namespace Aetherfall.EditorTools.Packages
{
    /// <summary>SELF-TEST: uses a Unity package (Input System) that the harness does not provide.</summary>
    public static class InputAssetCreator
    {
        /// <summary>Creates an empty action asset.</summary>
        public static InputActionAsset Create()
        {
            return UnityEngine.ScriptableObject.CreateInstance<InputActionAsset>();
        }
    }
}
