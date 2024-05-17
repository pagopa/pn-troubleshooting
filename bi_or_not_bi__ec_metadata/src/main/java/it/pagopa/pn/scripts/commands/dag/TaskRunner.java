package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Task;

public class TaskRunner {
    protected final TaskDag taskDag;

    public TaskRunner(TaskDag taskDag) {
        this.taskDag = taskDag;
    }

    public void linearRun() {
        taskDag.forEach(this::executeTask);
    }

    protected void executeTask(Task task) {
        task.run();
    }
}