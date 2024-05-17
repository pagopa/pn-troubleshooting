package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.caching.CachingProvider;
import it.pagopa.pn.scripts.commands.caching.SparkCacheManager;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.CacheEnum;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;

public class SparkTaskRunner extends TaskRunner {
    private static final int minInDegreeToCache = 2;
    private final SparkCacheManager sparkCacheManager;
    private final SparkSqlWrapper spark;

    public SparkTaskRunner(TaskDag taskDag, SparkSqlWrapper spark) {
        super(taskDag);
        this.spark = spark;

        this.sparkCacheManager = (SparkCacheManager) CachingProvider.create(CacheEnum.SPARK);
    }

    @Override
    protected void executeTask(Task task) {
        task.run();

        if (this.taskDag.getDag().inDegreeOf(task) >= minInDegreeToCache && Boolean.TRUE.equals(task.isPersist())) {
            this.sparkCacheManager.persist(spark, task.getName());
        }
    }

}
