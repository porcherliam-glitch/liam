// Price editor for a paid model (models.setPricing). A paid model is only used once a price is set (MASTERPROMPT §15).
import { useEffect, useState } from 'react';
import { Coins, Trash2 } from 'lucide-react';
import type { ModelInfo } from '@shared/schemas';
import { Button, Checkbox, Dialog } from '../../components/ui';
import { useMutation } from '../../hooks';
import { numberToInput, parseNumber } from '../settings/shared/forms';
import { NumberInput } from '../settings/shared/ui';

export interface PricingDialogProps {
  model: ModelInfo | null;
  onClose: () => void;
  onSaved: (model: ModelInfo) => void;
}

export function PricingDialog({ model, onClose, onSaved }: PricingDialogProps) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [estimated, setEstimated] = useState(true);
  const [errors, setErrors] = useState<{ input?: string; output?: string }>({});

  useEffect(() => {
    if (!model) return;
    setInput(numberToInput(model.pricing?.inputPerMTokUsd));
    setOutput(numberToInput(model.pricing?.outputPerMTokUsd));
    setEstimated(model.pricing?.estimated ?? true);
    setErrors({});
  }, [model]);

  const save = useMutation('models.setPricing', {
    errorToast: 'Preis konnte nicht gespeichert werden',
    successToast: (r) => (r.pricing ? `Preis für ${r.id} gespeichert` : `Preis für ${r.id} entfernt`),
    onSuccess: (r) => {
      onSaved(r);
      onClose();
    },
  });

  const submit = () => {
    const i = parseNumber(input, { min: 0, max: 10_000 });
    const o = parseNumber(output, { min: 0, max: 10_000 });
    const next = { input: i.error, output: o.error };
    setErrors(next);
    if (!model || i.error !== undefined || o.error !== undefined) return;
    void save.run({ providerId: model.providerId, modelId: model.id, pricing: { inputPerMTokUsd: i.value as number, outputPerMTokUsd: o.value as number, estimated } });
  };

  return (
    <Dialog
      open={model !== null}
      onClose={() => !save.loading && onClose()}
      dismissible={!save.loading}
      icon={Coins}
      tone="warning"
      title="Preis festlegen"
      description={model ? `${model.displayName && model.displayName !== model.id ? `${model.displayName} – ` : ''}${model.id}` : undefined}
      footer={
        <>
          {model?.pricing && (
            <Button variant="ghost" icon={Trash2} className="mr-auto" disabled={save.loading} onClick={() => model && void save.run({ providerId: model.providerId, modelId: model.id, pricing: null })}>
              Preis entfernen
            </Button>
          )}
          <Button onClick={onClose} disabled={save.loading}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={save.loading} onClick={submit}>
            Speichern
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-[13px] text-muted">Preise stehen auf der Preisseite des Anbieters, meist in US-Dollar pro einer Million Tokens. NOVA rechnet damit die Kosten aus und hält die Budget-Grenzen ein.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberInput label="Eingabe (Anfrage)" decimal unit="$ / 1 Mio." value={input} onChange={setInput} error={errors.input} hint="Preis für gesendete Tokens" required />
          <NumberInput label="Ausgabe (Antwort)" decimal unit="$ / 1 Mio." value={output} onChange={setOutput} error={errors.output} hint="Preis für erzeugte Tokens" required />
        </div>
        <Checkbox
          checked={estimated}
          onChange={setEstimated}
          label="Preis ist geschätzt"
          description="Angekreuzt lassen, wenn der Preis nicht genau bekannt ist. Kosten werden dann überall als „geschätzt“ gekennzeichnet."
        />
      </form>
    </Dialog>
  );
}
