using Aetherfall.Combat;
using UnityEngine;

namespace Aetherfall.AI
{
    /// <summary>
    /// Placeholder visuals of one enemy without animations: the telegraph (pulsing red tint and rearing up, GDD 03 9.5), the
    /// stunned state (orange tint and swaying) and the death (grey, tipping over and sinking).
    /// </summary>
    /// <remarks>Plain C# helper of <see cref="EnemyController"/> (no MonoBehaviour); every part is optional.</remarks>
    public sealed class EnemyVisuals
    {
        private static readonly Color DeadColor = new Color(0.25f, 0.25f, 0.25f);

        private readonly Transform _body;
        private readonly HitFlash _flash;
        private readonly Color _telegraphColor;
        private readonly Color _stunnedColor;
        private readonly Quaternion _restRotation;
        private readonly Vector3 _restPosition;

        /// <summary>Creates the visuals; remembers the rest pose of the body.</summary>
        /// <param name="body">Visible body (child object), may be null.</param>
        /// <param name="flash">Hit flash and tint, may be null.</param>
        /// <param name="telegraphColor">Tint while telegraphing.</param>
        /// <param name="stunnedColor">Tint while stunned.</param>
        public EnemyVisuals(Transform body, HitFlash flash, Color telegraphColor, Color stunnedColor)
        {
            _body = body;
            _flash = flash;
            _telegraphColor = telegraphColor;
            _stunnedColor = stunnedColor;
            if (body != null)
            {
                _restRotation = body.localRotation;
                _restPosition = body.localPosition;
            }
        }

        /// <summary>Updates tint and pose for one frame.</summary>
        /// <param name="telegraph">True during the wind-up of an attack.</param>
        /// <param name="stunned">True while stunned.</param>
        /// <param name="time">Game time in seconds (pulse and sway).</param>
        /// <param name="deltaTime">Frame time.</param>
        public void Refresh(bool telegraph, bool stunned, float time, float deltaTime)
        {
            if (_flash != null)
            {
                if (telegraph)
                {
                    _flash.SetTint(_telegraphColor, 0.55f + 0.35f * Mathf.Sin(time * 25f));
                }
                else
                {
                    _flash.SetTint(_stunnedColor, stunned ? 0.65f : 0f);
                }
            }

            if (_body == null)
            {
                return;
            }

            // Telegraph: rear up (nose up); stunned: sway.
            Quaternion wanted = _restRotation;
            if (telegraph)
            {
                wanted = _restRotation * Quaternion.Euler(-22f, 0f, 0f);
            }
            else if (stunned)
            {
                wanted = _restRotation * Quaternion.Euler(0f, 0f, Mathf.Sin(time * 6f) * 12f);
            }

            _body.localRotation = Quaternion.Slerp(_body.localRotation, wanted, 1f - Mathf.Exp(-15f * deltaTime));
        }

        /// <summary>Greys the enemy out when it dies.</summary>
        public void ShowDead()
        {
            if (_flash != null)
            {
                _flash.SetTint(DeadColor, 0.8f);
            }
        }

        /// <summary>Tips the body over and lets it sink (death effect, one frame).</summary>
        /// <param name="deltaTime">Frame time.</param>
        public void UpdateDeath(float deltaTime)
        {
            if (_body == null)
            {
                return;
            }

            Quaternion fallen = _restRotation * Quaternion.Euler(0f, 0f, 90f);
            _body.localRotation = Quaternion.Slerp(_body.localRotation, fallen, 1f - Mathf.Exp(-8f * deltaTime));
            _body.localPosition = Vector3.Lerp(_body.localPosition, _restPosition + Vector3.down * 0.35f, 1f - Mathf.Exp(-3f * deltaTime));
        }

        /// <summary>Back to the rest pose without tint (respawn).</summary>
        public void Reset()
        {
            if (_body != null)
            {
                _body.localRotation = _restRotation;
                _body.localPosition = _restPosition;
            }

            if (_flash != null)
            {
                _flash.SetTint(Color.white, 0f);
            }
        }
    }
}
