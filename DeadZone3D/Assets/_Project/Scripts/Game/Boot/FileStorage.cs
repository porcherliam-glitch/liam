using System;
using System.IO;
using DeadZone.Core;
using UnityEngine;

namespace DeadZone.Game
{
    /// <summary>Saves as JSON files in Application.persistentDataPath (atomic replace via a temp file).</summary>
    public sealed class FileStorage : IStorage
    {
        private readonly string _dir;

        public FileStorage(string dir = null)
        {
            _dir = dir ?? Application.persistentDataPath;
            try { Directory.CreateDirectory(_dir); } catch (Exception e) { Debug.LogWarning("[DZ] Speicherordner nicht verfügbar: " + e.Message); }
        }

        private string PathOf(string key) => Path.Combine(_dir, key + ".json");

        public string Get(string key)
        {
            try { var p = PathOf(key); return File.Exists(p) ? File.ReadAllText(p) : null; }
            catch (Exception e) { Debug.LogWarning("[DZ] Lesen fehlgeschlagen: " + e.Message); return null; }
        }

        public bool Set(string key, string value)
        {
            try
            {
                var p = PathOf(key);
                var tmp = p + ".tmp";
                File.WriteAllText(tmp, value);
                if (File.Exists(p)) File.Replace(tmp, p, null);
                else File.Move(tmp, p);
                return true;
            }
            catch (Exception e) { Debug.LogWarning("[DZ] Speichern fehlgeschlagen: " + e.Message); return false; }
        }

        public void Delete(string key)
        {
            try { var p = PathOf(key); if (File.Exists(p)) File.Delete(p); } catch (Exception) { }
        }
    }
}
