package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Task;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Provide a common class to work with {@link DirectedAcyclicGraph} implementing a standard way to iterate
 * over graph vertices holding the topological order of the original DAG.
 * */
public class TaskDag implements Iterable<Task> {

    private final DirectedAcyclicGraph<Task, DefaultEdge> dag;
    private final Map<String, Task> entryPoints = new HashMap<>();

    public TaskDag() {
        this(new DirectedAcyclicGraph<>(DefaultEdge.class));
    }

    public TaskDag(DirectedAcyclicGraph<Task, DefaultEdge> dag) {
        this.dag = dag;
    }

    /**
     * Find all graph entrypoint (aka leaf vertices) checking in degree size
     *
     * @return a set of tasks
     * */
    public Set<Task> getEntryPoints() {
        return dag.vertexSet()
            .stream()
            .filter(v -> dag.inDegreeOf(v) == 0)
            .collect(Collectors.toSet());
    }

    /**
     * Find a graph entrypoint (aka leaf vertex) using its identifier
     *
     * @param id the identifier of the entrypoint vertex
     *
     * @return found node or else null
     * */
    @Nullable
    public Task getEntryPointById(String id) {
        return this.entryPoints.get(id);
    }

    /**
     * Returns the original DAG hold by this class
     *
     * @return original DAG
     * */
    public DirectedAcyclicGraph<Task, DefaultEdge> getDag() {
        return dag;
    }

    /**
     * Add new task vertex to internal VertexSet of DAG
     *
     * @param task task to add
     * */
    public void addTask(Task task) {
        dag.addVertex(task);
    }

    /**
     * Add new task vertex to internal VertexSet of DAG and marks it as entrypoint
     *
     * @param task          task to add
     * @param isEntryPoint  boolean to decide if task is an entrypoint
     * */
    public void addTask(Task task, boolean isEntryPoint) {
        this.addTask(task);

        if (isEntryPoint) this.entryPoints.put(task.getId(), task);
    }

    /**
     * Remove a vertex task from original DAG
     * */
    public void removeTask(Task task) {
        dag.removeVertex(task);
    }

    /**
     * Add a directed edge from task <i>from</i> to task <i>to</i>.
     * Every time new edge is created {@link DirectedAcyclicGraph} checks whether it is possible to introduce cycles
     * and throws a CycleFoundException
     *
     * @param from  vertex from which the edge starts
     * @param to    vertex where the edge arrives
     * */
    public void addDependency(Task from, Task to) {
        dag.addEdge(from, to);
    }

    /**
     * Remove a directed edge from task <i>from</i> to task <i>to</i>.
     * Every time new edge is removed {@link DirectedAcyclicGraph} checks whether it is possible to introduce cycles
     * and throws a CycleFoundException
     *
     * @param from  vertex from which the edge starts
     * @param to    vertex where the edge arrives
     * */
    public void removeDependency(Task from, Task to) {
        dag.removeEdge(from, to);
    }

    @NotNull
    @Override
    public Iterator<Task> iterator() {
        LinkedList<Task> list = new LinkedList<>();
        dag.iterator().forEachRemaining(list::add);
        return list.descendingIterator();
    }

    public int size() {
        return dag.vertexSet().size();
    }

    /**
     * Export graph using mermaid markdown representation.
     * More information about mermaid here: <a href="https://mermaid.js.org/">Mermaid</a>
     * <pre>
     *     ```mermaid
     *     graph LR
     *     VertexA --> VertexB
     *     VertexA --> VertexC
     *     VertexB --> VertexD
     *     ```
     * </pre>
     *
     * @return the graph in mermaid representation
     * */
    public String toMermaid() {
        final String HEAD = "```mermaid\ngraph LR\n";
        final String TAIL = "\n```";

        StringJoiner edgeJoiner = new StringJoiner("\n");

        this.dag.edgeSet().forEach(edge -> edgeJoiner.add(
            this.dag.getEdgeSource(edge).getId() + " --> " + this.dag.getEdgeTarget(edge).getId())
        );

        return HEAD + edgeJoiner + TAIL;
    }

}
