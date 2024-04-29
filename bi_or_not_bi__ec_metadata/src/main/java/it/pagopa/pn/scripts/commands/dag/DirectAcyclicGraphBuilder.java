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
public final class DirectAcyclicGraphBuilder <V extends Vertex> {

    private final Set<V> vertices;
    private final Set<Edge> edges;

    private DirectAcyclicGraphBuilder() {
        this.vertices = new HashSet<>();
        this.edges = new HashSet<>();
    }

    public static <T extends Vertex>  DirectAcyclicGraphBuilder<T> builder() {
        return new DirectAcyclicGraphBuilder<>();
    }

    public DirectedAcyclicGraph<V, DefaultEdge> build() {
        DirectedAcyclicGraph<V, DefaultEdge> dag = new DirectedAcyclicGraph<>(DefaultEdge.class);

        this.vertices.forEach(dag::addVertex);
        this.edges.forEach(e -> dag.addEdge(((V) e.getSource()), ((V) e.getTarget())));

        return dag;
    }

    public DirectAcyclicGraphBuilder<V> addVertex(V vertex) {
        this.vertices.add(vertex);
        return this;
    }

    public DirectAcyclicGraphBuilder<V> addEdge(Edge edge) {
        this.edges.add(edge);
        return this;
    }
}
