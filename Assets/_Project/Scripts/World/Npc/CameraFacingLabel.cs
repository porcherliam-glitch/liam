using UnityEngine;

namespace Aetherfall.World
{
    /// <summary>
    /// Turns a world text (the name sign of an NPC) toward the camera every frame, so it is readable from every side - NPCs
    /// walk their daily routines and turn around (GDD 01 7.1). Only the yaw follows: the text stays upright.
    /// </summary>
    /// <remarks>GameObject: the TextMesh of the sign.</remarks>
    [DisallowMultipleComponent]
    public sealed class CameraFacingLabel : MonoBehaviour
    {
        private void LateUpdate()
        {
            Camera view = Camera.main;
            if (view == null)
            {
                return;
            }

            Vector3 away = transform.position - view.transform.position;
            away.y = 0f;
            if (away.sqrMagnitude > 0.0001f)
            {
                transform.rotation = Quaternion.LookRotation(away, Vector3.up);
            }
        }
    }
}
