namespace Aetherfall.UI.Framework
{
    /// <summary>Shows and hides the UIDocument of a layer (implemented by the UI root in the boot scene).</summary>
    public interface IUiLayerHost
    {
        /// <summary>Shows or hides a layer.</summary>
        /// <param name="layer">Layer.</param>
        /// <param name="visible">True = visible.</param>
        void SetLayerVisible(UILayer layer, bool visible);
    }
}
