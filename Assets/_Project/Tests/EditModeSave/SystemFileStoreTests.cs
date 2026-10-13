using System;
using System.IO;
using System.Text;
using Aetherfall.Events;
using Aetherfall.SaveSystem;
using NUnit.Framework;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// <see cref="SystemFileStore"/> and a whole save/load on the real file system in a temporary folder
    /// (architecture 9.4: "Verhalten von File.Replace auf macOS und Windows in Phase 1 testen").
    /// </summary>
    [TestFixture]
    public sealed class SystemFileStoreTests
    {
        private string _root;
        private SystemFileStore _files;

        [SetUp]
        public void SetUp()
        {
            _root = Path.Combine(Path.GetTempPath(), "aetherfall-save-tests-" + Guid.NewGuid().ToString("N"));
            _files = new SystemFileStore();
        }

        [TearDown]
        public void TearDown()
        {
            if (Directory.Exists(_root))
            {
                Directory.Delete(_root, true);
            }
        }

        [Test]
        public void WriteReadMoveReplaceDelete()
        {
            string folder = Path.Combine(_root, "char_01");
            _files.CreateDirectory(folder);
            string a = Path.Combine(folder, "a.sav");
            string b = Path.Combine(folder, "b.sav");
            string backup = b + ".bak";

            _files.WriteAllBytes(a, Encoding.UTF8.GetBytes("one"));
            _files.Move(a, b);
            _files.WriteAllBytes(a, Encoding.UTF8.GetBytes("two"));
            _files.Replace(a, b, backup);

            Assert.That(_files.FileExists(a), Is.False);
            Assert.That(Encoding.UTF8.GetString(_files.ReadAllBytes(b)), Is.EqualTo("two"));
            Assert.That(Encoding.UTF8.GetString(_files.ReadAllBytes(backup)), Is.EqualTo("one"));

            _files.WriteAllBytes(a, Encoding.UTF8.GetBytes("three"));
            _files.Replace(a, b, backup);
            Assert.That(Encoding.UTF8.GetString(_files.ReadAllBytes(backup)), Is.EqualTo("two"), "an existing backup is replaced");

            Assert.That(_files.GetFiles(folder, ".sav"), Has.Count.EqualTo(1));
            Assert.That(_files.GetDirectories(_root), Has.Count.EqualTo(1));
            _files.Delete(b);
            _files.Delete(b);
            Assert.That(_files.FileExists(b), Is.False);
            Assert.That(_files.GetFiles(Path.Combine(_root, "missing"), ".sav"), Is.Empty);
        }

        [Test]
        public void Replace_WithoutBackup_SwapsTheFile_WithBackup_KeepsACopyOfTheOldOne()
        {
            string folder = Path.Combine(_root, "char_01");
            _files.CreateDirectory(folder);
            string temp = Path.Combine(folder, "slot.sav.tmp");
            string save = Path.Combine(folder, "slot.sav");
            string backup = save + ".bak";
            _files.WriteAllBytes(save, Encoding.UTF8.GetBytes("old"));
            _files.WriteAllBytes(temp, Encoding.UTF8.GetBytes("new"));

            _files.Replace(temp, save, null);

            Assert.That(Encoding.UTF8.GetString(_files.ReadAllBytes(save)), Is.EqualTo("new"));
            Assert.That(_files.FileExists(temp), Is.False);
            Assert.That(_files.FileExists(backup), Is.False, "no backup requested");

            _files.WriteAllBytes(temp, Encoding.UTF8.GetBytes("newer"));
            _files.Replace(temp, save, backup);

            Assert.That(Encoding.UTF8.GetString(_files.ReadAllBytes(save)), Is.EqualTo("newer"));
            Assert.That(Encoding.UTF8.GetString(_files.ReadAllBytes(backup)), Is.EqualTo("new"));
            Assert.That(_files.FileExists(temp), Is.False);
        }

        [Test]
        public void SaveManager_OnTheRealFileSystem_SavesAndLoads()
        {
            using (var env = new SaveTestEnvironment())
            {
                var settings = new SaveManagerSettings { UseBackgroundThread = false, UtcNow = () => env.Now };
                var manager = new SaveManager(env.Bus, env.StateService, _files, new FixedSaveLocation(_root), settings);
                var counter = new CounterSaveable("counter", 1) { Value = 21 };
                manager.Register(counter);

                Assert.That(manager.Save(SaveRequest.Quick()).Success, Is.True);
                env.Advance(10);
                counter.Value = 22;
                Assert.That(manager.Save(new SaveRequest(SaveKind.Manual, "slot")).Success, Is.True);
                env.Advance(10);
                counter.Value = 23;
                Assert.That(manager.Save(new SaveRequest(SaveKind.Manual, "slot")).Success, Is.True);
                counter.Value = 0;

                Assert.That(manager.Load("char_01/slot").Success, Is.True);
                Assert.That(counter.Value, Is.EqualTo(23));
                Assert.That(File.Exists(Path.Combine(_root, "char_01", "slot.sav.bak")), Is.True);
                Assert.That(File.Exists(Path.Combine(_root, "char_01", "slot.head.json")), Is.True);
                Assert.That(Directory.GetFiles(Path.Combine(_root, "char_01"), "*.tmp"), Is.Empty);
                manager.Dispose();
            }
        }
    }
}
