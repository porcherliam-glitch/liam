// Aufgaben of a project: the shared task board (filters, priority, controls, details, create/edit dialog)
// plus "Ziel planen" (tasks.plan). ?task=… highlights and expands one task.
import { useState } from 'react';
import { Target } from 'lucide-react';
import type { ProjectSummary } from '@shared/schemas';
import { Button } from '../../../components/ui';
import { TaskBoard } from '../../../components/project';
import { PlanGoalDialog } from './PlanGoalDialog';

export interface TasksTabProps {
  project: ProjectSummary;
  highlightTaskId?: string | null;
}

export function TasksTab({ project, highlightTaskId }: TasksTabProps) {
  const [planOpen, setPlanOpen] = useState(false);
  return (
    <>
      <TaskBoard
        projectId={project.id}
        highlightTaskId={highlightTaskId}
        gitAvailable={project.gitAvailable}
        extraActions={
          project.status === 'active' && (
            <Button icon={Target} onClick={() => setPlanOpen(true)}>
              Ziel planen
            </Button>
          )
        }
      />
      <PlanGoalDialog open={planOpen} onClose={() => setPlanOpen(false)} projectId={project.id} projectName={project.name} />
    </>
  );
}
