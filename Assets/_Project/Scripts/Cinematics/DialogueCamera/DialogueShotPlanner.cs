using Aetherfall.Dialogue;

namespace Aetherfall.Cinematics
{
    /// <summary>
    /// The cutting rules of the dialogue camera (GDD 02 12.6, binding): a conversation opens on the two-shot (1.5 s, or 2.5 s with
    /// the hint "Eröffnung"), a partner's line is the shot over the player's shoulder (close-up only with the hint "Nah", two-shot
    /// with "Totale" or "Objekt"), a choice is the reverse shot onto the player. No cut before a shot was on screen for 1.5 s – a
    /// cut that comes too early waits inside its line and is dropped when the next line comes –, at most one cut per line, the
    /// same setup on the next line is no cut, and after 3 lines on one setup the next automatic line goes to the two-shot. Pure
    /// logic; the time is the scaled game time of the director (it stands still while the game is paused).
    /// </summary>
    public sealed class DialogueShotPlanner
    {
        private int _beat = int.MinValue;
        private bool _cutInBeat;
        private DialogueSetup _wanted;
        private double _setupSince;
        private double _openUntil;
        private bool _started;

        /// <summary>The setup on screen.</summary>
        public DialogueSetup Current { get; private set; } = DialogueSetup.Wide;

        /// <summary>Lines in a row on the current setup.</summary>
        public int BeatsOnSetup { get; private set; }

        /// <summary>True after <see cref="Begin"/> until <see cref="End"/>.</summary>
        public bool IsActive => _started;

        /// <summary>Starts a conversation on the two-shot.</summary>
        /// <param name="now">Time in seconds.</param>
        public void Begin(double now)
        {
            _started = true;
            _beat = int.MinValue;
            _cutInBeat = false;
            Current = DialogueSetup.Wide;
            _wanted = DialogueSetup.Wide;
            _setupSince = now;
            _openUntil = now + DialogueCameraRules.OpeningSeconds;
            BeatsOnSetup = 0;
        }

        /// <summary>Ends the conversation.</summary>
        public void End()
        {
            _started = false;
        }

        /// <summary>Feeds the state of the conversation; returns true if the camera cuts now (to <see cref="Current"/>).</summary>
        /// <param name="beat">Counter of the line or choice on screen (changes with every new line).</param>
        /// <param name="choice">True while the player chooses an answer.</param>
        /// <param name="hint">Camera hint of the line.</param>
        /// <param name="speaker">Who speaks the line.</param>
        /// <param name="choiceFraming">What a choice shows.</param>
        /// <param name="now">Time in seconds.</param>
        public bool Update(int beat, bool choice, DialogueCameraHint hint, DialogueSpeaker speaker, ChoiceFraming choiceFraming, double now)
        {
            if (!_started)
            {
                return false;
            }

            if (beat != _beat)
            {
                bool first = _beat == int.MinValue;
                _beat = beat;
                _cutInBeat = false;
                if (first && hint == DialogueCameraHint.Opening)
                {
                    _openUntil = _setupSince + DialogueCameraRules.OpeningHintSeconds;
                }

                _wanted = Wanted(choice, hint, speaker, choiceFraming);
                if (_wanted == Current)
                {
                    BeatsOnSetup++;
                }
            }

            if (_wanted == Current || _cutInBeat || now < _openUntil || now - _setupSince < DialogueCameraRules.MinShotSeconds)
            {
                return false;
            }

            Current = _wanted;
            _setupSince = now;
            _cutInBeat = true;
            BeatsOnSetup = 1;
            return true;
        }

        private DialogueSetup Wanted(bool choice, DialogueCameraHint hint, DialogueSpeaker speaker, ChoiceFraming choiceFraming)
        {
            if (choice)
            {
                return choiceFraming == ChoiceFraming.ListeningCloseUp ? DialogueSetup.Close : DialogueSetup.ReverseShot;
            }

            if (speaker == DialogueSpeaker.Player)
            {
                return DialogueSetup.ReverseShot;
            }

            if (speaker == DialogueSpeaker.Other)
            {
                return DialogueSetup.Wide;
            }

            switch (hint)
            {
                case DialogueCameraHint.Close:
                    return DialogueSetup.Close;
                case DialogueCameraHint.Wide:
                case DialogueCameraHint.Object:
                    return DialogueSetup.Wide;
                case DialogueCameraHint.Auto:
                    // GDD 03: a change every 1–3 lines – the fourth automatic line on the same setup goes to the two-shot.
                    return Current == DialogueSetup.Shot && BeatsOnSetup >= DialogueCameraRules.MaxBeatsPerSetup ? DialogueSetup.Wide : DialogueSetup.Shot;
                default:
                    return DialogueSetup.Shot;
            }
        }
    }
}
