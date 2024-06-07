package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Task;

/**
 * Executor class that runs every task installed within a {@link TaskDag} Direct Acyclic Graph of {@link Task}
 * */
public class TaskRunner {

    protected final TaskDag taskDag;

    public TaskRunner(TaskDag taskDag) {
        this.taskDag = taskDag;
    }

    /**
     * Runs each task sequentially using one single thread
     * */
    public void linearRun() {
        taskDag.forEach(this::executeTask);
    }

    protected void executeTask(Task task) {
        task.run();
    }
}