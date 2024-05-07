package it.pagopa.pn.scripts.commands.utils;

import it.pagopa.pn.scripts.commands.dag.TaskDag;
import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryDag;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

public class QueryDagToTaskDagAdapter {
    private QueryDagToTaskDagAdapter() {}

    public static TaskDag from(SqlQueryDag sqlQueryDag, Function<Task, Object> job) {
        Map<String, Task> tasks = new HashMap<>();
        TaskDag taskDag = new TaskDag();
        sqlQueryDag.forEach(v -> {
            var id = buildQueryId(v.getLocation(), v.getName());
            var name = v.getName();
            var sqlQuery = v.getSqlQuery();

            var sqlTask = new SQLTask(id, name, sqlQuery, job);
            taskDag.addTask(sqlTask);
            tasks.put(id, sqlTask);
        });

        sqlQueryDag.getDag().edgeSet().forEach(e -> {
            var edgeSource = sqlQueryDag.getDag().getEdgeSource(e);
            var edgeTarget = sqlQueryDag.getDag().getEdgeTarget(e);

            var sourceId = buildQueryId(edgeSource.getLocation(), edgeSource.getName());
            var targetId = buildQueryId(edgeTarget.getLocation(), edgeTarget.getName());

            var sourceTask = tasks.get(sourceId);
            var targetTask = tasks.get(targetId);

            taskDag.addDependency(sourceTask, targetTask);
        });

        return taskDag;
    }

    private static String buildQueryId(String queryLocation, String queryName) {
        return queryLocation + '#' + queryName;
    }
}
