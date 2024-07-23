package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryDag;
import it.pagopa.pn.scripts.commands.utils.QueryDagToTaskDagAdapter;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.util.List;
import java.util.function.Function;

public class SqlQueryHolderToTaskTest {

    @Test
    public void fromClasspathResourceSingleDAGTest() {

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
        TaskDag taskDag = QueryDagToTaskDagAdapter.from(List.of(sqlQueryDag), job);
        TaskRunner runner = new TaskRunner(taskDag);
        runner.linearRun();

        taskDag.forEach(t -> System.out.printf("Result %s: %s\n", t.getId(), t.getResult(String.class)));


        // Then
        Assert.assertNotNull(taskDag);
        Assert.assertEquals(taskDag.size(), 8);
    }

    @Test
    public void fromClasspathResourceMultipleDAGPartiallyJointTest() {

        // Given
        String sourceBasePath = "";

        String sqlResourceName1 = "./testgraph/file0.sql";
        String queryName1 = "query00";

        String sqlResourceName2 = "./testgraph/file3.sql";
        String queryName2 = "query30";

        // When
        SqlQueryDag sqlQueryDag1 = SqlQueryDag.fromResource(sqlResourceName1, queryName1, sourceBasePath);
        SqlQueryDag sqlQueryDag2 = SqlQueryDag.fromResource(sqlResourceName2, queryName2, sourceBasePath);


        Function<Task, Object> job = (task) -> {
            System.out.println("Task running: " + ((SQLTask) task).getSqlQuery());
            return task.getName();
        };

        TaskDag taskDag = QueryDagToTaskDagAdapter.from(List.of(sqlQueryDag1, sqlQueryDag2), job);
        TaskRunner runner = new TaskRunner(taskDag);
        runner.linearRun();

        taskDag.forEach(t -> System.out.printf("Result %s: %s\n", t.getId(), t.getResult(String.class)));


        // Then
        Assert.assertNotNull(taskDag);
        Assert.assertEquals(taskDag.size(), 10);
    }

    @Test
    public void fromClasspathResourceMultipleDAGDisjointTest() {

        // Given
        String sourceBasePath = "";

        String sqlResourceName1 = "./testgraph/file0.sql";
        String queryName1 = "query00";

        String sqlResourceName2 = "./testgraph/file4.sql";
        String queryName2 = "query40";

        // When
        SqlQueryDag sqlQueryDag1 = SqlQueryDag.fromResource(sqlResourceName1, queryName1, sourceBasePath);
        SqlQueryDag sqlQueryDag2 = SqlQueryDag.fromResource(sqlResourceName2, queryName2, sourceBasePath);


        Function<Task, Object> job = (task) -> {
            System.out.println("Task running: " + ((SQLTask) task).getSqlQuery());
            return task.getName();
        };

        TaskDag taskDag = QueryDagToTaskDagAdapter.from(List.of(sqlQueryDag1, sqlQueryDag2), job);
        TaskRunner runner = new TaskRunner(taskDag);
        runner.linearRun();

        taskDag.forEach(t -> System.out.printf("Result %s: %s\n", t.getId(), t.getResult(String.class)));


        // Then
        Assert.assertNotNull(taskDag);
        Assert.assertEquals(taskDag.size(), 12);
    }
}
