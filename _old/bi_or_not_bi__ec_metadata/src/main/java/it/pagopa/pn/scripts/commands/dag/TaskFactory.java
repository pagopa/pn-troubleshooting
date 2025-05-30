package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.TaskEnum;

/**
 * Factory for {@link Task} subclasses
 * */
public final class TaskFactory {

    private TaskFactory() {}

    /**
     * Create {@link Task} object based on {@link TaskEnum} value
     *
     * @param taskType  the type of task to instantiate
     *
     * @return          a new task
     * */
    public static Task createTask(TaskEnum taskType) {

        if (taskType == TaskEnum.SQL) return new SQLTask();
        throw new IllegalArgumentException("Unsupported task type: " + taskType);
    }

}
