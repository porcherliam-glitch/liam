namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Camera hint of a line (GDD 02, 12.6 "Kamera-Hinweis am Knoten"). The dialogue camera (later, Cinemachine) reads it from
    /// the current line; <see cref="Auto"/> follows the rules of 12.6. Values are stored in assets: never renumber.
    /// </summary>
    public enum DialogueCameraHint
    {
        /// <summary>Automatic (default): shot over the player's shoulder onto the speaker.</summary>
        Auto = 0,

        /// <summary>Close-up (German "Nah"), only for strong emotions.</summary>
        Close = 1,

        /// <summary>Wide shot (German "Totale").</summary>
        Wide = 2,

        /// <summary>Over the shoulder (German "Ueber-die-Schulter").</summary>
        OverShoulder = 3,

        /// <summary>Look at an object (German "Objekt"), e.g. a letter.</summary>
        Object = 4,

        /// <summary>Opening two-shot (German "Eroeffnung", 1.5-3 s), then the shot.</summary>
        Opening = 5
    }
}
