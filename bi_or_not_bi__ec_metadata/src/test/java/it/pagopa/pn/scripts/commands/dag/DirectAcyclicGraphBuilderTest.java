package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Edge;
import it.pagopa.pn.scripts.commands.dag.model.SQLTask;
import it.pagopa.pn.scripts.commands.dag.model.Vertex;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;
import org.testng.annotations.Test;

import java.util.Iterator;

public class DirectAcyclicGraphBuilderTest {


    @Test
    public void buildDAGTest() {

        // Given
        SQLTask node1 = new SQLTask("1", "node1", "SELECT * FROM table1");
        SQLTask node2 = new SQLTask("2", "node2","SELECT * FROM table2");
        SQLTask node3 = new SQLTask("3", "node3","SELECT * FROM table1 LEFT JOIN table2 ON table1.id = table2.id");
        SQLTask node4 = new SQLTask("4", "node4","CREATE TEMPORARY VIEW temp AS SELECT id FROM table4");

        Edge dependency34 = new Edge(node4, node3);
        Edge dependency13 = new Edge(node3, node1);
        Edge dependency23 = new Edge(node2, node1);

        DirectedAcyclicGraph<Vertex, DefaultEdge> graph = DirectAcyclicGraphBuilder.builder()
            .addVertex(node1)
            .addVertex(node2)
            .addVertex(node3)
            .addVertex(node4)
            .addEdge(dependency34)
            .addEdge(dependency13)
            .addEdge(dependency23)
            .build();

        for (Vertex vertex : graph) {
            System.out.println(vertex);
        }

    }

}
