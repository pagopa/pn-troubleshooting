package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Task;

import java.util.logging.Logger;

public class TaskRunner {

    private final TaskDag taskDag;

    public TaskRunner(TaskDag taskDag) {
        this.taskDag = taskDag;
    }

    public void linearRun() {
        // Here only to launch exception
        taskDag.getEntryPoint();
        for(var task : taskDag){
            executeTask(task);
        }
    }

    private void executeTask(Task task) {
        task.run();
    }

}
