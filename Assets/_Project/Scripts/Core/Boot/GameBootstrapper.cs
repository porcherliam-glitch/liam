using System;
using System.Collections.Generic;
using System.Threading;
using UnityEngine;

namespace Aetherfall.Core
{
    /// <summary>
    /// Starts the game (architecture 4.1, §6.2): creates all services from the installer list of <see cref="BootConfig"/>,
    /// initializes them in a fixed order and switches to <see cref="GameState.MainMenu"/>. Knows no system directly.
    /// </summary>
    /// <remarks>
    /// <para>GameObject: <c>GameBootstrapper</c> in <c>Scenes/Boot/Boot.unity</c> (build index 0). The boot scene stays loaded
    /// for the whole session; all other scenes are loaded additively (no <c>DontDestroyOnLoad</c>).</para>
    /// <para>Sequence (log category Boot, "Step n/7"):</para>
    /// <list type="number">
    /// <item>Awake: set the log sink (<see cref="UnityLogSink"/>).</item>
    /// <item>Awake: create a new <see cref="ServiceLocator"/> and publish it via <see cref="Services.Locator"/>.</item>
    /// <item>Awake: validate the installer order (<see cref="InstallerOrderValidator"/>, fail-fast).</item>
    /// <item>Awake: run every installer; verify its registrations against its <c>Provides</c> declaration.</item>
    /// <item>Start: await every <see cref="IInitializable.InitializeAsync"/> one after another (timeout + destroyCancellationToken).</item>
    /// <item>Start: call every <see cref="IPostInitializable.PostInitialize"/>, hand <see cref="ITickable"/>s to the <see cref="TickRunner"/>.</item>
    /// <item>Start: switch the game state to MainMenu.</item>
    /// </list>
    /// <para>Steps 1–4 run in Awake with execution order -10000, so services exist before any other object of the boot
    /// scene runs Awake. Objects in other scenes must not rely on that (see EditorBootstrap); they use
    /// <c>Services.Locator.TryGet</c> and wait.</para>
    /// <para>Any error or a timeout stops the boot: the services created so far are disposed, <see cref="Services.Locator"/>
    /// is cleared and <see cref="BootFailureScreen"/> is shown – never a half-initialized game. On destruction all services
    /// implementing <see cref="IDisposable"/> are disposed in reverse registration order.</para>
    /// </remarks>
    [DefaultExecutionOrder(-10000)]
    [DisallowMultipleComponent]
    public sealed class GameBootstrapper : MonoBehaviour
    {
        [Tooltip("Boot-Konfiguration mit der geordneten Installer-Liste (Assets/_Project/Settings/Boot/BootConfig.asset). Pflichtfeld.")]
        [SerializeField] private BootConfig bootConfig;

        [Tooltip("Zentraler Update-Runner für ITickable-Dienste. Leer lassen = der TickRunner am selben GameObject wird verwendet bzw. automatisch ergänzt.")]
        [SerializeField] private TickRunner tickRunner;

        private ServiceLocator _locator;
        private TickRunner _activeTickRunner;
        private CancellationTokenSource _initCancellation;
        private BootPhase _phase = BootPhase.NotStarted;
        private bool _ownsServices;
        private double _bootStartTime;
        private double _initStartTime;
        private float _timeoutSeconds = BootConfig.DefaultInitializationTimeoutSeconds;
        private string _currentStep = "starting";

        /// <summary>True after the boot completed and the game switched to the main menu.</summary>
        public bool IsBootCompleted => _phase == BootPhase.Running;

        /// <summary>True if the boot failed or timed out (the error screen is shown).</summary>
        public bool HasFailed => _phase == BootPhase.Failed;

        private void Awake()
        {
            _phase = BootPhase.Installing;
            _bootStartTime = Time.realtimeSinceStartupAsDouble;

            // Step 1: logging first, so every following step can report problems.
            Log.SetSink(new UnityLogSink());

            if (Services.Locator != null)
            {
                _phase = BootPhase.Inactive;
                Log.Error(LogCategory.Boot, "A second GameBootstrapper ('" + name + "' in scene '" + gameObject.scene.name +
                                            "') was started while services are already running. It is ignored. Make sure the boot scene is loaded only once.");
                enabled = false;
                return;
            }

            Log.Info(LogCategory.Boot, "Step 1/7: Log sink set. Boot started (Unity " + Application.unityVersion + ", " + Application.platform + ").");

            if (bootConfig == null)
            {
                Fail("No BootConfig assigned. Select the GameObject '" + name + "' in the boot scene and assign " +
                     "Assets/_Project/Settings/Boot/BootConfig.asset to the field 'Boot Config'.");
                return;
            }

            // Step 2: a fresh locator for every boot (Domain Reload is off, nothing may survive from the last session).
            _locator = new ServiceLocator();
            Services.Set(_locator);
            _ownsServices = true;
            Log.Info(LogCategory.Boot, "Step 2/7: ServiceLocator created.");

            // Step 3: validate the order before any installer runs (fail-fast).
            IReadOnlyList<ServiceInstaller> installers = bootConfig.Installers;
            var descriptions = new List<IInstallerDescription>(installers.Count);
            for (int i = 0; i < installers.Count; i++)
            {
                // Unity null check: also catches missing/destroyed installer assets.
                descriptions.Add(installers[i] != null ? installers[i] : null);
            }

            InstallerValidationResult validation = InstallerOrderValidator.Validate(descriptions, new[] { typeof(IGameStateService) });
            if (!validation.IsValid)
            {
                Fail(validation.BuildReport("BootConfig '" + bootConfig.name + "' is invalid. Fix the list 'Installers' in its Inspector:"));
                return;
            }

            Log.Info(LogCategory.Boot, "Step 3/7: Installer order validated (" + installers.Count + " installer(s)).");

            // Step 4: create and register services.
            var recorder = new RecordingServiceRegistry(_locator);
            for (int i = 0; i < installers.Count; i++)
            {
                ServiceInstaller installer = installers[i];
                _currentStep = "installing '" + installer.name + "'";
                recorder.ClearRecording();
                try
                {
                    installer.Install(recorder, _locator);
                }
                catch (Exception exception)
                {
                    Log.Exception(LogCategory.Boot, exception, "Installer '" + installer.name + "' (Element " + i + ") threw an exception.");
                    Fail("Installer '" + installer.name + "' (Element " + i + ") threw " + exception.GetType().Name + ": " + exception.Message);
                    return;
                }

                InstallerValidationResult registrations = InstallerOrderValidator.CheckRegistrations(installer, recorder.RecordedTypes);
                if (!registrations.IsValid)
                {
                    Fail(registrations.BuildReport("Installer '" + installer.name + "' (Element " + i + ") does not match its Provides declaration:"));
                    return;
                }

                Log.Info(LogCategory.Boot, "Step 4/7: Installed '" + installer.name + "' (provides: " + DescribeTypes(recorder.RecordedTypes) + ").");
            }

            _phase = BootPhase.Installed;
        }

        private async void Start()
        {
            // async void is the documented exception for Unity event adapters (architecture 15.2, rule 10): everything is caught here.
            if (_phase != BootPhase.Installed)
            {
                return;
            }

            try
            {
                await RunInitializationAsync();
            }
            catch (OperationCanceledException)
            {
                if (IsBooting())
                {
                    Fail("Initialization was cancelled while " + _currentStep + ".");
                }
            }
            catch (Exception exception)
            {
                if (IsBooting())
                {
                    Log.Exception(LogCategory.Boot, exception, "Boot failed while " + _currentStep + ".");
                    Fail("Exception while " + _currentStep + ": " + exception.GetType().Name + ": " + exception.Message);
                }
            }
        }

        private void Update()
        {
            // Watchdog for step 5: also fires if a service ignores its cancellation token and never completes.
            if (_phase != BootPhase.Initializing)
            {
                return;
            }

            double elapsed = Time.realtimeSinceStartupAsDouble - _initStartTime;
            if (elapsed > _timeoutSeconds)
            {
                Fail("Initialization timed out after " + _timeoutSeconds.ToString("0.#") + " s while " + _currentStep + ". " +
                     "Every IInitializable must finish within 'Initialization Timeout Seconds' of the BootConfig and observe its cancellation token.");
            }
        }

        private void OnDestroy()
        {
            if (_phase == BootPhase.NotStarted || _phase == BootPhase.Inactive || _phase == BootPhase.ShutDown)
            {
                return;
            }

            _phase = BootPhase.ShutDown;
            CancelInitialization();
            ShutdownServices();

            if (_initCancellation != null)
            {
                _initCancellation.Dispose();
                _initCancellation = null;
            }
        }

        private async Awaitable RunInitializationAsync()
        {
            // Step 5: asynchronous initialization, one service after another, in registration order.
            _phase = BootPhase.Initializing;
            _timeoutSeconds = Mathf.Max(1f, bootConfig.InitializationTimeoutSeconds);
            _initCancellation = CancellationTokenSource.CreateLinkedTokenSource(destroyCancellationToken);
            CancellationToken cancellationToken = _initCancellation.Token;
            _initStartTime = Time.realtimeSinceStartupAsDouble;

            object[] services = CopyServiceInstances();
            int initializedCount = 0;
            for (int i = 0; i < services.Length; i++)
            {
                if (!(services[i] is IInitializable initializable))
                {
                    continue;
                }

                string serviceName = services[i].GetType().Name;
                _currentStep = "initializing " + serviceName;
                Log.Info(LogCategory.Boot, "Step 5/7: Initializing " + serviceName + " ...");

                Awaitable operation = initializable.InitializeAsync(cancellationToken);
                if (operation == null)
                {
                    throw new InvalidOperationException(serviceName + ".InitializeAsync returned null instead of an Awaitable.");
                }

                await operation;
                if (_phase != BootPhase.Initializing)
                {
                    return; // Timed out or shut down while awaiting.
                }

                cancellationToken.ThrowIfCancellationRequested();
                initializedCount++;
            }

            Log.Info(LogCategory.Boot, "Step 5/7: " + initializedCount + " service(s) initialized in " +
                                       (Time.realtimeSinceStartupAsDouble - _initStartTime).ToString("0.00") + " s.");

            // Step 6: PostInitialize (subscribe to foreign events), then start ticking.
            _phase = BootPhase.PostInitializing;
            int postInitializedCount = 0;
            var tickables = new List<ITickable>();
            for (int i = 0; i < services.Length; i++)
            {
                if (services[i] is IPostInitializable postInitializable)
                {
                    _currentStep = "post-initializing " + services[i].GetType().Name;
                    postInitializable.PostInitialize();
                    postInitializedCount++;
                }

                if (services[i] is ITickable tickable)
                {
                    tickables.Add(tickable);
                }
            }

            EnsureTickRunner().SetTickables(tickables);
            Log.Info(LogCategory.Boot, "Step 6/7: PostInitialize called on " + postInitializedCount + " service(s); " + tickables.Count + " tickable(s) registered.");

            // Step 7: enter the main menu. (Loading the MainMenu scene follows with the SceneLoader, Phase 1 step 1.4.)
            _currentStep = "switching to MainMenu";
            IGameStateService gameState = _locator.Get<IGameStateService>();
            _phase = BootPhase.Running;
            Log.Info(LogCategory.Boot, "Step 7/7: Switching to MainMenu.");
            if (!gameState.SwitchBase(GameState.MainMenu, "Boot completed"))
            {
                Fail("The game state service refused the switch to MainMenu (current state: " + gameState.Current + ").");
                return;
            }

            Log.Info(LogCategory.Boot, "Boot completed in " + (Time.realtimeSinceStartupAsDouble - _bootStartTime).ToString("0.00") +
                                       " s (" + _locator.Count + " service(s)).");
        }

        private bool IsBooting()
        {
            return _phase == BootPhase.Initializing || _phase == BootPhase.PostInitializing || _phase == BootPhase.Running;
        }

        private void Fail(string message)
        {
            if (_phase == BootPhase.Failed || _phase == BootPhase.ShutDown)
            {
                return;
            }

            _phase = BootPhase.Failed;
            Log.Fatal(LogCategory.Boot, "Boot failed: " + message);
            CancelInitialization();
            ShutdownServices();

            if (!TryGetComponent(out BootFailureScreen screen))
            {
                screen = gameObject.AddComponent<BootFailureScreen>();
            }

            screen.Show(message, Application.consoleLogPath);
        }

        private void CancelInitialization()
        {
            if (_initCancellation == null || _initCancellation.IsCancellationRequested)
            {
                return;
            }

            try
            {
                _initCancellation.Cancel();
            }
            catch (Exception exception)
            {
                Log.Exception(LogCategory.Boot, exception, "A cancellation callback of a service threw an exception.");
            }
        }

        private void ShutdownServices()
        {
            if (_activeTickRunner != null)
            {
                _activeTickRunner.ClearTickables();
            }

            if (_locator != null)
            {
                IReadOnlyList<object> instances = _locator.Instances;
                int disposedCount = 0;
                for (int i = instances.Count - 1; i >= 0; i--)
                {
                    if (!(instances[i] is IDisposable disposable))
                    {
                        continue;
                    }

                    try
                    {
                        disposable.Dispose();
                        disposedCount++;
                    }
                    catch (Exception exception)
                    {
                        Log.Exception(LogCategory.Boot, exception, "Dispose of " + instances[i].GetType().Name + " failed.");
                    }
                }

                Log.Info(LogCategory.Boot, "Services shut down (" + disposedCount + " disposed in reverse registration order).");
            }

            if (_ownsServices && ReferenceEquals(Services.Locator, _locator))
            {
                Services.Reset();
            }

            _ownsServices = false;
            _locator = null;
        }

        private TickRunner EnsureTickRunner()
        {
            if (_activeTickRunner != null)
            {
                return _activeTickRunner;
            }

            if (tickRunner != null)
            {
                _activeTickRunner = tickRunner;
            }
            else if (!TryGetComponent(out _activeTickRunner))
            {
                _activeTickRunner = gameObject.AddComponent<TickRunner>();
            }

            return _activeTickRunner;
        }

        private object[] CopyServiceInstances()
        {
            IReadOnlyList<object> instances = _locator.Instances;
            var copy = new object[instances.Count];
            for (int i = 0; i < copy.Length; i++)
            {
                copy[i] = instances[i];
            }

            return copy;
        }

        private static string DescribeTypes(IReadOnlyList<Type> types)
        {
            if (types.Count == 0)
            {
                return "-";
            }

            var names = new string[types.Count];
            for (int i = 0; i < names.Length; i++)
            {
                names[i] = types[i].Name;
            }

            return string.Join(", ", names);
        }
    }
}
