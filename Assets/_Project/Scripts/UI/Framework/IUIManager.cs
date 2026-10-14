using System;

namespace Aetherfall.UI.Framework
{
    /// <summary>
    /// The UI manager (architecture 4.9): opens and closes screens on the focus stack, routes the UI input to the top screen
    /// (own focus layer), queues on-screen messages and shows or hides layers.
    /// </summary>
    /// <remarks>
    /// Deviation from 4.9: <c>ConfirmAsync</c> (confirmation dialog, focus starts on "Abbrechen") follows with the first
    /// dialog that needs it; destructive menu actions use hold-to-confirm (GDD 05 1.4).
    /// </remarks>
    public interface IUIManager
    {
        /// <summary>The top screen (owns the focus), or null.</summary>
        UIScreen Top { get; }

        /// <summary>Message queue (GDD 05 1.7).</summary>
        NotificationQueue Notifications { get; }

        /// <summary>True: navigation input is ignored (e.g. while the loading screen is visible).</summary>
        bool InputBlocked { get; set; }

        /// <summary>Raised after a screen opened.</summary>
        event Action<UIScreen> ScreenOpened;

        /// <summary>Raised after a screen closed.</summary>
        event Action<UIScreen> ScreenClosed;

        /// <summary>Registers a screen so that <see cref="Open{TScreen}"/> and <see cref="Get{TScreen}"/> find it.</summary>
        /// <param name="screen">Screen.</param>
        void RegisterScreen(UIScreen screen);

        /// <summary>Returns the registered screen of a type, or null.</summary>
        /// <typeparam name="TScreen">Screen type.</typeparam>
        TScreen Get<TScreen>() where TScreen : UIScreen;

        /// <summary>Opens the registered screen of a type and puts it on top of the focus stack.</summary>
        /// <typeparam name="TScreen">Screen type.</typeparam>
        /// <param name="args">Optional arguments for the screen.</param>
        /// <returns>The screen, or null if none of this type is registered.</returns>
        TScreen Open<TScreen>(object args = null) where TScreen : UIScreen;

        /// <summary>Opens a screen (registers it if needed) and puts it on top.</summary>
        /// <param name="screen">Screen.</param>
        /// <param name="args">Optional arguments.</param>
        void Open(UIScreen screen, object args = null);

        /// <summary>Closes a screen; the focus returns to the screen below.</summary>
        /// <param name="screen">Screen.</param>
        void Close(UIScreen screen);

        /// <summary>Closes all open screens.</summary>
        void CloseAll();

        /// <summary>B / Esc: the top screen steps back or closes.</summary>
        /// <returns>True if something happened.</returns>
        bool Back();

        /// <summary>Queues an on-screen message (GDD 05 1.7).</summary>
        /// <param name="notification">Message.</param>
        void ShowToast(in Notification notification);

        /// <summary>Shows or hides a layer.</summary>
        /// <param name="layer">Layer.</param>
        /// <param name="visible">True = visible.</param>
        void SetLayerVisible(UILayer layer, bool visible);

        /// <summary>True if a layer is visible.</summary>
        /// <param name="layer">Layer.</param>
        bool IsLayerVisible(UILayer layer);

        /// <summary>Connects the object that owns the UIDocuments of the layers (the UI root of the boot scene).</summary>
        /// <param name="host">Layer host, or null to disconnect.</param>
        void AttachLayerHost(IUiLayerHost host);
    }
}
