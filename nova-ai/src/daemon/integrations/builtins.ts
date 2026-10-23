// The built-in IntegrationModules (one per id in BUILTIN_INTEGRATIONS, same order). Registered by
// createIntegrationService; further modules can be added at runtime with IntegrationService.register().
import { BUILTIN_INTEGRATIONS } from '@shared/schemas';
import type { IntegrationModule } from '../contracts';
import type { ModuleDeps } from './helpers';
import {
  dotnetModule,
  gitModule,
  nodeModule,
  npmModule,
  ollamaModule,
  playwrightModule,
  powershellModule,
  pythonModule,
  vscodeModule,
  windowsTerminalModule,
  wingetModule,
} from './modules-tools';
import { godotModule, unityModule, unrealModule } from './modules-engines';
import { comfyuiModule } from './modules-comfyui';

const FACTORIES: Record<(typeof BUILTIN_INTEGRATIONS)[number], (deps: ModuleDeps) => IntegrationModule> = {
  git: gitModule,
  node: nodeModule,
  npm: npmModule,
  python: pythonModule,
  dotnet: dotnetModule,
  powershell: powershellModule,
  windows_terminal: windowsTerminalModule,
  ollama: ollamaModule,
  comfyui: comfyuiModule,
  unity: unityModule,
  unreal: unrealModule,
  godot: godotModule,
  vscode: vscodeModule,
  playwright: playwrightModule,
  winget: wingetModule,
};

export function createBuiltinModules(deps: ModuleDeps): IntegrationModule[] {
  return BUILTIN_INTEGRATIONS.map((id) => FACTORIES[id](deps));
}
