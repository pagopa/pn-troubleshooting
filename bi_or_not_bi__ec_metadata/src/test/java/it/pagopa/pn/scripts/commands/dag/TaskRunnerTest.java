package it.pagopa.pn.scripts.commands.dag;
import it.pagopa.pn.scripts.commands.dag.model.Edge;
import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.dag.model.Vertex;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;
import org.testng.annotations.Test;

import java.util.concurrent.ExecutionException;

public class TaskRunnerTest {
    @Test
    public void runTasksTwoEntriesTest() throws ExecutionException, InterruptedException {

        /*
            node1
                node2
                    node4
                node3
                    node5
                    node6
                        node8
            node7
         */

        // Given
        SQLTask node1 = new SQLTask("1", "node1", "SELECT * FROM table1");
        SQLTask node2 = new SQLTask("2", "node2","SELECT * FROM table2");
        SQLTask node3 = new SQLTask("3", "node3","SELECT * FROM table1 LEFT JOIN table2 ON table1.id = table2.id");
        SQLTask node4 = new SQLTask("4", "node4","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node5 = new SQLTask("5", "node5","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node6 = new SQLTask("6", "node6","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node7 = new SQLTask("7", "node7","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node8 = new SQLTask("8", "node8","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");

        Edge dependency12 = new Edge(node1, node2);
        Edge dependency13 = new Edge(node1, node3);
        Edge dependency24 = new Edge(node2, node4);
        Edge dependency35 = new Edge(node3, node5);
        Edge dependency36 = new Edge(node3, node6);
        Edge dependency68 = new Edge(node6, node8);

        DirectedAcyclicGraph<Task, DefaultEdge> graph = DirectAcyclicGraphBuilder.<Task>builder()
                .addVertex(node1)
                .addVertex(node2)
                .addVertex(node3)
                .addVertex(node4)
                .addVertex(node5)
                .addVertex(node6)
                .addVertex(node7)
                .addVertex(node8)
                .addEdge(dependency12)
                .addEdge(dependency13)
                .addEdge(dependency24)
                .addEdge(dependency35)
                .addEdge(dependency36)
                .addEdge(dependency68)
                .build();

        TaskRunner taskRunner = TaskRunner.getRunnerFor(graph);
        taskRunner.linearRun();
    }

    @Test
    public void runTasksSingleEntryTest() throws ExecutionException, InterruptedException {

        /*
            node1
                node2
                    node4
                node3
                    node5
                    node6
                        node8
         */

        // Given
        SQLTask node1 = new SQLTask("1", "node1", "SELECT * FROM table1");
        SQLTask node2 = new SQLTask("2", "node2","SELECT * FROM table2");
        SQLTask node3 = new SQLTask("3", "node3","SELECT * FROM table1 LEFT JOIN table2 ON table1.id = table2.id");
        SQLTask node4 = new SQLTask("4", "node4","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node5 = new SQLTask("5", "node5","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node6 = new SQLTask("6", "node6","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");
        SQLTask node8 = new SQLTask("8", "node8","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");

        Edge dependency12 = new Edge(node1, node2);
        Edge dependency13 = new Edge(node1, node3);
        Edge dependency24 = new Edge(node2, node4);
        Edge dependency35 = new Edge(node3, node5);
        Edge dependency36 = new Edge(node3, node6);
        Edge dependency68 = new Edge(node6, node8);

        DirectedAcyclicGraph<Task, DefaultEdge> graph = DirectAcyclicGraphBuilder.<Task>builder()
                .addVertex(node1)
                .addVertex(node2)
                .addVertex(node3)
                .addVertex(node4)
                .addVertex(node5)
                .addVertex(node6)
                .addVertex(node8)
                .addEdge(dependency12)
                .addEdge(dependency13)
                .addEdge(dependency24)
                .addEdge(dependency35)
                .addEdge(dependency36)
                .addEdge(dependency68)
                .build();

        TaskRunner taskRunner = TaskRunner.getRunnerFor(graph);
        taskRunner.linearRun();
    }
}
