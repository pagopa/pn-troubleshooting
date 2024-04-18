package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Edge;
import it.pagopa.pn.scripts.commands.dag.model.Vertex;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;

import java.util.HashSet;
import java.util.Set;

/**
 * Builder for {@link DirectedAcyclicGraph} class
 * */
public final class DirectAcyclicGraphBuilder {

    private final Set<Vertex> vertices;
    private final Set<Edge> edges;

    private DirectAcyclicGraphBuilder() {
        this.vertices = new HashSet<>();
        this.edges = new HashSet<>();
    }

    public static DirectAcyclicGraphBuilder builder() {
        return new DirectAcyclicGraphBuilder();
    }

    public DirectedAcyclicGraph<Vertex, DefaultEdge> build() {
        DirectedAcyclicGraph<Vertex, DefaultEdge> dag = new DirectedAcyclicGraph<>(DefaultEdge.class);

        this.vertices.forEach(dag::addVertex);
        this.edges.forEach(e -> dag.addEdge(e.getSource(), e.getTarget()));

        return dag;
    }

    public DirectAcyclicGraphBuilder addVertex(Vertex vertex) {
        this.vertices.add(vertex);
        return this;
    }

    public DirectAcyclicGraphBuilder addEdge(Edge edge) {
        this.edges.add(edge);
        return this;
    }
}
