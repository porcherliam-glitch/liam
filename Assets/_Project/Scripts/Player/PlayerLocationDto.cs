using UnityEngine.Scripting;

namespace Aetherfall.Player
{
    /// <summary>
    /// Save section <c>player</c> (architecture 9.2, load order 110): world space, cell + local position (architecture 9.7,
    /// 512 m cells), yaw, mounted, movement mode. DTO: public fields allowed (architecture 9.1).
    /// </summary>
    [Preserve]
    public sealed class PlayerLocationDto
    {
        /// <summary>World space id.</summary>
        public string WorldSpaceId = string.Empty;

        /// <summary>Cell index along X.</summary>
        public int CellX;

        /// <summary>Cell index along Z.</summary>
        public int CellZ;

        /// <summary>Position inside the cell along X in metres.</summary>
        public float LocalX;

        /// <summary>Height of the feet in metres.</summary>
        public float LocalY;

        /// <summary>Position inside the cell along Z in metres.</summary>
        public float LocalZ;

        /// <summary>Facing in degrees.</summary>
        public float Yaw;

        /// <summary>True while riding (later).</summary>
        public bool Mounted;

        /// <summary>Movement mode id (<c>onFoot</c>; later swimming, climbing …).</summary>
        public string MovementMode = PlayerLocationSaveable.OnFootMode;
    }
}
