# Anleitung 13 – Erster Start in Unity (Windows)

Stand: 2026-10-14. Diese Schritte hat Claude auf deinem PC schon im Hintergrund erledigt. Hier steht, wie du das Projekt selbst öffnest und kurz prüfst, ob alles stimmt.

## 1. Wo liegt das Projekt?

- Ordner: `Desktop\Aetherfall`
- Unity-Version: **6000.6.5f1** (im Unity Hub schon installiert)
- Die Hilfs-Vorlage `Desktop\AetherfallVorlage` wird nicht mehr gebraucht. Du kannst sie löschen, wenn du magst.

## 2. Projekt im Unity Hub öffnen

1. Unity Hub starten.
2. Links auf **Projects**, dann oben rechts auf den Pfeil neben **Add** und **Add project from disk** wählen.
3. Den Ordner `Desktop\Aetherfall` auswählen.
4. In der Liste bei **Editor Version** `6000.6.5f1` einstellen und das Projekt anklicken.
5. Der erste Start dauert einige Minuten. Unity muss alles einlesen.

## 3. Kurz prüfen

1. Unten im Fenster **Console** (falls nicht sichtbar: Menü **Window > General > Console**). Es dürfen **keine roten Fehler** stehen.
2. Menü **Aetherfall > Projekt-Setup …** öffnen. Alle Schritte sollten ✓ zeigen. Ein Punkt bleibt bewusst offen:
   - **Rendering Path** ✗ beim Renderer „Mobile“: wird nicht benutzt, kann so bleiben.
3. Menü **Window > General > Test Runner**, Reiter **EditMode**, **Run All**. Ergebnis: 2159 grün, 2 grau („unentschieden“).

## 4. Spiel kurz anspielen

**Hinweis:** Den Play Mode hat Claude noch nicht selbst ausprobiert. Das ist der nächste Schritt.

1. Im Project-Fenster `Assets/_Project/Scenes/Boot/Boot.unity` doppelklicken.
2. Oben auf ▶ (Play) drücken.
3. Hauptmenü → **Neues Spiel**. Du solltest im Dorf Eichental starten.
4. Steuerung: siehe [Anleitung 03](./03_Test_Spielfigur.md) und [Anleitung 05](./05_Test_Kampf.md).
5. Mit ▶ wieder beenden.

Wenn etwas komisch aussieht oder rote Fehler kommen: Screenshot machen und Claude schicken.

## 5. Was Claude dafür geändert hat (kurz)

- Projekt-Setup läuft jetzt auch ohne Klicken (für Claude: `ProjectSetupBatch.RunBatch`).
- Vier Fehler, die nur im echten Unity auftraten, sind behoben (Details in [Status](../Status.md)).
