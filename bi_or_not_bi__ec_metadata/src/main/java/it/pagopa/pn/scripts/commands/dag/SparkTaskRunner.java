package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.caching.CachingProvider;
import it.pagopa.pn.scripts.commands.caching.SparkCacheManager;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.enumerations.CacheEnum;
import it.pagopa.pn.scripts.commands.sparksql.SparkSqlWrapper;

/**
 * Specialization of {@link TaskRunner} adding the following capabilities:
 *
 * <ul>
 *   <li>
 *       Knows the Spark context using the {@link SparkSqlWrapper}
 *   </li>
 *   <li>
 *       Support caching adding in cache each dag task which have at least two incoming edges
 *   </li>
 * </ul>
 *
 * */
public class SparkTaskRunner extends TaskRunner {

    private static final int MIN_IN_DEGREE_TO_CACHE = 2;

    private final SparkCacheManager sparkCacheManager;
    private final SparkSqlWrapper spark;

    public SparkTaskRunner(TaskDag taskDag, SparkSqlWrapper spark) {
        super(taskDag);

        this.spark = spark;
        this.sparkCacheManager = (SparkCacheManager) CachingProvider.create(CacheEnum.SPARK);
    }

    /**
     * Executes a task job and save it in cache when its incoming edges
     * are {@link SparkTaskRunner#MIN_IN_DEGREE_TO_CACHE} or more
     *
     * @param task the task to execute
     * */
    @Override
    protected void executeTask(Task task) {
        task.run();

        if (this.taskDag.getDag().inDegreeOf(task) >= MIN_IN_DEGREE_TO_CACHE && Boolean.TRUE.equals(task.isPersist())) {
            this.sparkCacheManager.persist(spark, task.getName());
        }
    }

}
