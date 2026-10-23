// Shared German UI sentences that must be worded exactly as agreed in SPEC §6.0 / UI-SPEC §7.

/** Honest limits of the approval system (approval cards, Settings › Berechtigungen). */
export const HONEST_LIMITS_TEXT =
  'NOVA fragt vor bekannten riskanten Befehlen nach. Projektcode, Tests und Build-Skripte, die ein Agent geschrieben hat, laufen jedoch mit den Rechten des Windows-Kontos und können technisch nicht eingeschränkt werden.';

/** Shown before autonomous work is enabled for the first time on an opened/imported project. */
export const TRUST_PROJECT_TEXT =
  'Von NOVA ausgeführte Befehle, Tests und Builds laufen mit den Rechten des Windows-Kontos. Nur vertrauenswürdige Projekte für die autonome Arbeit freigeben.';

/** Secret store explanation (Models page, Settings). */
export const SECRET_STORE_TEXT =
  'Schlüssel sind mit dem Windows-Konto verschlüsselt. Programme unter diesem Konto – auch von NOVA ausgeführte Projektbefehle – können sie auslesen.';

/** Info banner when the daemon was not shut down cleanly last time. */
export const UNCLEAN_SHUTDOWN_TEXT = 'NOVA wurde zuletzt nicht sauber beendet – unterbrochene Aufgaben wurden geprüft.';

/** Warning for a non-local provider marked as free. */
export const FREE_CLOUD_PROVIDER_TEXT = 'Ist dieser Anbieter wirklich kostenlos?';
