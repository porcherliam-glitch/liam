import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Target } from 'lucide-react';
import { Button, Dialog, Textarea } from '../../../components/ui';
import { useMutation } from '../../../hooks/useRpc';
import { paths } from '../../../lib/paths';
import { toast } from '../../../stores/toasts';

export interface PlanGoalDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  /** Prefill (e.g. the suggested next step). */
  initialGoal?: string;
}

/** "Ziel planen": the planner breaks a goal into tasks (tasks.plan). */
export function PlanGoalDialog({ open, onClose, projectId, projectName, initialGoal = '' }: PlanGoalDialogProps) {
  const navigate = useNavigate();
  const [goal, setGoal] = useState(initialGoal);
  const [error, setError] = useState<string | null>(null);
  const plan = useMutation('tasks.plan', { errorToast: false });

  useEffect(() => {
    if (!open) return;
    setGoal(initialGoal);
    setError(null);
  }, [open, initialGoal]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) {
      setError('Bitte das Ziel kurz beschreiben.');
      return;
    }
    try {
      const task = await plan.runAsync({ projectId, goal: goal.trim() });
      toast.show({ tone: 'success', title: 'Ziel wird geplant', message: 'Der Planer zerlegt das Ziel jetzt in Aufgaben.' });
      onClose();
      navigate(paths.project(projectId, { tab: 'tasks', task: task.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das Ziel konnte nicht geplant werden.');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !plan.loading && onClose()}
      dismissible={!plan.loading}
      icon={Target}
      title="Ziel planen"
      description={`Der Planer zerlegt das Ziel in kleine, prüfbare Aufgaben für „${projectName}“.`}
      footer={
        <>
          <Button onClick={onClose} disabled={plan.loading}>
            Abbrechen
          </Button>
          <Button variant="primary" type="submit" form="plan-goal-form" icon={Target} loading={plan.loading}>
            Planen lassen
          </Button>
        </>
      }
    >
      <form id="plan-goal-form" onSubmit={(e) => void submit(e)} noValidate>
        <Textarea
          label="Was soll als Nächstes erreicht werden?"
          required
          rows={5}
          value={goal}
          onChange={(e) => {
            setGoal(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          placeholder="z. B. Ein zweites Level mit beweglichen Plattformen und einem Schalter."
          data-autofocus
        />
      </form>
    </Dialog>
  );
}
