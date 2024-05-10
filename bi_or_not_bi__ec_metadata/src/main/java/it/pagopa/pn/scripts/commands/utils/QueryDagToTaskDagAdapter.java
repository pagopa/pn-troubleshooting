package it.pagopa.pn.scripts.commands.utils;

import it.pagopa.pn.scripts.commands.dag.TaskDag;
import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryDag;

import java.util.Collection;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class QueryDagToTaskDagAdapter {
    private QueryDagToTaskDagAdapter() {}

    public static TaskDag from(Collection<SqlQueryDag> sqlQueryDags, Function<Task, Object> job) {
        Map<String, Task> tasks = new HashMap<>();
        TaskDag taskDag = new TaskDag();

        sqlQueryDags.forEach(sqlQueryDag -> append(sqlQueryDag, taskDag, tasks, job));

        return taskDag;
    }

    private static void append(SqlQueryDag sqlQueryDag, TaskDag taskDag, Map<String, Task> tasks, Function<Task, Object> job) {
        sqlQueryDag.forEach(v -> {
            var id = Task.buildId(v.getLocation(), v.getName());

            if (!tasks.containsKey(id)) {
                var name = v.getName();
                var sqlQuery = v.getSqlQuery();

                var sqlTask = new SQLTask(id, name, sqlQuery, job);

                taskDag.addTask(sqlTask, v.isEntryPoint());
                tasks.put(id, sqlTask);
            }
        });

        sqlQueryDag.getDag().edgeSet().forEach(e -> {
            var edgeSource = sqlQueryDag.getDag().getEdgeSource(e);
            var edgeTarget = sqlQueryDag.getDag().getEdgeTarget(e);

            var sourceId = Task.buildId(edgeSource.getLocation(), edgeSource.getName());
            var targetId = Task.buildId(edgeTarget.getLocation(), edgeTarget.getName());

            var sourceTask = tasks.get(sourceId);
            var targetTask = tasks.get(targetId);

            taskDag.addDependency(sourceTask, targetTask);
        });
    }
}
