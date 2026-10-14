namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Emotion tag of a line (GDD 02, 12.8): later drives voice direction, facial animation and the close-up camera. Values are
    /// stored in assets: never renumber.
    /// </summary>
    public enum DialogueEmotion
    {
        /// <summary>Neutral (German "neutral").</summary>
        Neutral = 0,

        /// <summary>Friendly (German "freundlich").</summary>
        Friendly = 1,

        /// <summary>Angry (German "wuetend"); counts as strong emotion.</summary>
        Angry = 2,

        /// <summary>Afraid (German "aengstlich").</summary>
        Afraid = 3,

        /// <summary>Sad (German "traurig"); counts as strong emotion.</summary>
        Sad = 4,

        /// <summary>Mocking (German "spoettisch").</summary>
        Mocking = 5,

        /// <summary>Whispering (German "fluesternd").</summary>
        Whispering = 6
    }
}
