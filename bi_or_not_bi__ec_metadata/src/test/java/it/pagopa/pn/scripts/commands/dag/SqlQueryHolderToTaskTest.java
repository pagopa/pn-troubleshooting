package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryDag;
import it.pagopa.pn.scripts.commands.utils.QueryDagToTaskDagAdapter;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.function.Function;

public class SqlQueryHolderToTaskTest {
    @Test
    public void fromClasspathResourceTest() {

        // Given
        String sourceBasePath = "";
        String sqlResourceName = "./testgraph/file0.sql";
        String queryName = "query00";

        // When
        SqlQueryDag sqlQueryDag = SqlQueryDag.fromResource(sqlResourceName, queryName, sourceBasePath);

        Function<Task, Object> job = (task) -> {
            System.out.println("Task running: " + ((SQLTask) task).getSqlQuery());
            return task.getName();
        };
        TaskDag taskDag = QueryDagToTaskDagAdapter.from(sqlQueryDag, job);
        TaskRunner runner = new TaskRunner(taskDag);
        runner.linearRun();

        taskDag.forEach(t -> System.out.printf("Result %s: %s\n", t.getId(), t.getResult(String.class)));


        // Then
        Assert.assertNotNull(taskDag);
        Assert.assertEquals(taskDag.size(), 8);
    }
}
