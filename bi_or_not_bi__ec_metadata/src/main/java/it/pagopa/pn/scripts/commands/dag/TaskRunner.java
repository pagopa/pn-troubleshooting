package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.caching.CachingProvider;
import it.pagopa.pn.scripts.commands.caching.SparkCacheManager;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.CacheEnum;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;

public class TaskRunner {

    private final TaskDag taskDag;
    private final SparkCacheManager sparkCacheManager;
    private final SparkSqlWrapper spark;

    public TaskRunner(TaskDag taskDag, SparkSqlWrapper spark) {
        this.taskDag = taskDag;
        this.spark = spark;

        this.sparkCacheManager = (SparkCacheManager) CachingProvider.create(CacheEnum.SPARK);
    }

    public void linearRun() {
        taskDag.forEach(this::executeTask);
    }

    private void executeTask(Task task) {
        task.run();

        if (this.taskDag.getDag().inDegreeOf(task) >= 2 && Boolean.TRUE.equals(task.isPersist())) {
            this.sparkCacheManager.persist(spark, task.getName());
        }
    }

}
