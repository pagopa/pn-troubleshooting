package it.pagopa.pn.scripts.commands.dag;

import it.pagopa.pn.scripts.commands.exceptions.EmptyGraphException;
import it.pagopa.pn.scripts.commands.exceptions.MoreThanOneEntryException;
import it.pagopa.pn.scripts.commands.dag.model.Task;
import it.pagopa.pn.scripts.commands.sparksql.SqlQueryHolder;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;

import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Supplier;
import java.util.logging.Logger;
import java.util.stream.Stream;

public class TaskRunner {
    private static final Logger log = Logger.getLogger(TaskRunner.class.getName());
    private final DirectedAcyclicGraph<Task, DefaultEdge> dag;
    private final Task entryTask;
    private ExecutorService executor;
    private final Collection<Future<?>> executorFutures;

    public static TaskRunner getRunnerFor(DirectedAcyclicGraph<Task, DefaultEdge> dag) {
        if (dag.vertexSet().isEmpty()) {
            throw new EmptyGraphException();
        }
        return new TaskRunner(dag, getEntryPoint(dag));
    }

    private TaskRunner(DirectedAcyclicGraph<Task, DefaultEdge> dag, Task entryTask) {
        this.dag = dag;
        this.entryTask = entryTask;
        this.executorFutures = new LinkedList<>();
    }

    public Iterator<Task> linearRun() {
        LinkedList<Task> list = new LinkedList<>();
        dag.iterator().forEachRemaining(list::add);
        var iterator = list.descendingIterator();
        while (iterator.hasNext()) {
            var t = iterator.next();
            executeTask(t);
        }

        return list.descendingIterator();
    }

//    public void parallelRun(int maxParallelTasks) throws ExecutionException, InterruptedException {
//        executor = Executors.newFixedThreadPool(maxParallelTasks); // Executor with multiple threads
//        try {
//            depthFirstSearch(entryTask, new HashSet<>());
//        } finally {
//            executor.shutdown();
//        }
//    }
//
//    private void depthFirstSearch(Task startVertex, Set<Task> visited, Collection<Future<?>> executorFutures) throws ExecutionException, InterruptedException {
//        // Visita il vertice
//        visited.add(startVertex);
//
//        // Visita ricorsivamente tutti i vertici adiacenti non visitati
//        for (var edge : dag.outgoingEdgesOf(startVertex)) {
//            Task target = dag.getEdgeTarget(edge);
//            if (!visited.contains(target)) {
//                depthFirstSearch(target, visited);
//            }
//        }
//        waitTasks();
//        addTask(startVertex);
//    }


    // A
    // B C

//    private void addTask(Task task) {
//        executorFutures.add(executor.submit(() -> {
//            executeTask(task);
//        }));
//        task.run();
//    }
//
//    private void waitTasks() throws ExecutionException, InterruptedException {
//        for (Future<?> future : executorFutures) {
//            future.get();
//        }
//        executorFutures.clear();
//    }

    private void executeTask(Task task) {
        log.info("Executing task: " + task);
        task.run();
    }

    private static Task getEntryPoint(DirectedAcyclicGraph<Task, DefaultEdge> dag) {
        Supplier<Stream<Task>> taskSupplier = () -> dag.vertexSet().stream().filter(v -> dag.inDegreeOf(v) == 0);

        if (taskSupplier.get().count() > 1) {
            throw new MoreThanOneEntryException();
        }
        return taskSupplier.get().findFirst().orElse(null);
    }
}
