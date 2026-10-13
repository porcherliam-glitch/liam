// Harness-only stub: the single UnityEngine type the pure Core files use (an attribute, no runtime call).
namespace UnityEngine
{
    internal enum RuntimeInitializeLoadType { AfterSceneLoad, BeforeSceneLoad, AfterAssembliesLoaded, BeforeSplashScreen, SubsystemRegistration }
    [System.AttributeUsage(System.AttributeTargets.Method, AllowMultiple = false)]
    internal sealed class RuntimeInitializeOnLoadMethodAttribute : System.Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute() { }
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType loadType) { }
    }
}
