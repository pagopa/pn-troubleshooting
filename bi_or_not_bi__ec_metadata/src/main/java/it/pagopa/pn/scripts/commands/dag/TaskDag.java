package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.exceptions.MoreThanOneEntryException;
import org.jetbrains.annotations.NotNull;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;

import java.util.Iterator;
import java.util.LinkedList;
import java.util.function.Supplier;
import java.util.logging.Logger;
import java.util.stream.Stream;

public class TaskDag implements Iterable<Task> {
    private static final Logger log = Logger.getLogger(TaskDag.class.getName());
    private final DirectedAcyclicGraph<Task, DefaultEdge> dag;

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

    public DirectedAcyclicGraph<Task, DefaultEdge> getDag() {
        return dag;
    }

    public void addTask(Task task) {
        dag.addVertex(task);
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

}
