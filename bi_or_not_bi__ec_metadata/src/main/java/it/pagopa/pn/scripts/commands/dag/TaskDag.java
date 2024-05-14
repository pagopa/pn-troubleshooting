package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.exceptions.MoreThanOneEntryException;
import org.jetbrains.annotations.NotNull;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;

import java.rmi.server.ExportException;
import java.util.*;
import java.util.function.Supplier;
import java.util.stream.Stream;

public class TaskDag implements Iterable<Task> {

    private final DirectedAcyclicGraph<Task, DefaultEdge> dag;
    private final Map<String, Task> entryPoints = new HashMap<>();

    public TaskDag() {
        this(new DirectedAcyclicGraph<>(DefaultEdge.class));
    }

    public TaskDag(DirectedAcyclicGraph<Task, DefaultEdge> dag) {
        this.dag = dag;
    }

    public Task getEntryPoint() {
        Supplier<Stream<Task>> taskSupplier = () -> dag.vertexSet().stream().filter(v -> dag.inDegreeOf(v) == 0);

        if (taskSupplier.get().count() > 1) {
            throw new MoreThanOneEntryException();
        }
        return taskSupplier.get().findFirst().orElse(null);
    }

    public Task getEntryPointById(String id) {
        return this.entryPoints.get(id);
    }

    public DirectedAcyclicGraph<Task, DefaultEdge> getDag() {
        return dag;
    }

    public void addTask(Task task) {
        dag.addVertex(task);
    }

    public void addTask(Task task, boolean isEntryPoint) {
        this.addTask(task);

        if (isEntryPoint) this.entryPoints.put(task.getId(), task);
    }

    public void removeTask(Task task) {
        dag.removeVertex(task);
    }

    public void addDependency(Task from, Task to) {
        dag.addEdge(from, to);
    }

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
     *
     * @return the graph in mermaid representation
     * */
    public String toMermaid() {
        final String HEAD = "```mermaid\ngraph TD\n";
        final String TAIL = "\n```";

        StringJoiner edgeJoiner = new StringJoiner("\n");

        this.dag.edgeSet().forEach(edge -> edgeJoiner.add(
            this.dag.getEdgeSource(edge).getId() + " --> " + this.dag.getEdgeTarget(edge).getId())
        );

        return HEAD + edgeJoiner + TAIL;
    }

}
