// Secrets sub-module of env: SecretStore (Windows DPAPI, macOS Keychain, Linux libsecret, aes-local fallback, memory).
export { createSecretStore } from './secret-store';
export type { SecretStoreImpl, SecretStoreOptions, SecretScheme } from './secret-store';
