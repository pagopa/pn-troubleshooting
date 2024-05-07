package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.exceptions.DependencyCycleException;
import it.pagopa.pn.scripts.commands.exceptions.FileNotFoundException;
import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;
import it.pagopa.pn.scripts.commands.utils.PathsUtils;
import org.jetbrains.annotations.NotNull;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.graph.DirectedAcyclicGraph;
import org.jgrapht.graph.GraphCycleProhibitedException;

import java.io.IOException;
import java.nio.file.Paths;
import java.util.*;

public class SqlQueryDag implements Iterable<SqlQueryHolder> {

    // <queryFileLocation#queryName, SqlQueryHolder>
    private final LinkedHashMap<String, SqlQueryHolder> queries;

    // <queryFileLocation, SqlQueryMap>
    private final Map<String, Map<String, SqlQueryHolder>> files;

    private final DirectedAcyclicGraph<SqlQueryHolder, DefaultEdge> dag;

    final SqlQueryParser sqlQueryParser;
    final boolean isInResource;
    final SqlQueryHolder entryQuery;

    private final String sourceBasePath;

    public static SqlQueryDag fromResource(String fileLocation, String entryQuery, String sourceBasePath){
        return new SqlQueryDag(fileLocation, entryQuery, sourceBasePath, true);
    }

    public static SqlQueryDag fromFile(String fileLocation, String entryQuery, String sourceBasePath){
        return new SqlQueryDag(fileLocation, entryQuery, sourceBasePath, false);
    }

    private SqlQueryDag(String fileLocation, String entryQuery, String sourceBasePath, boolean isInResource){
        this.isInResource = isInResource;
        this.sqlQueryParser = new SqlQueryParser();
        this.queries = new LinkedHashMap<>();
        this.files = new HashMap<>();
        this.dag = new DirectedAcyclicGraph<>(DefaultEdge.class);
        this.sourceBasePath = sourceBasePath;

        Map<String, SqlQueryHolder> rootQueries = getQueriesFromFile(fileLocation);
        this.entryQuery = rootQueries.get(entryQuery);
        this.entryQuery.setLocation(fileLocation);
        files.put(fileLocation, rootQueries);
        buildAbstractDependenciesGraph();
        buildDag();
    }


    private void buildAbstractDependenciesGraph() {
        // Put start query into viewing list
        queries.put(buildQueryId(entryQuery.getLocation(), entryQuery.getName()), entryQuery);

        int currentQueryIndex = 0;
        // Iterate over query and add new ones
        while (currentQueryIndex < queries.size()) {
            var currentQuery = queries.values().toArray(SqlQueryHolder[]::new)[currentQueryIndex];

            // Add dependencies to nodes if they not exists
            currentQuery.getDependencies().forEach(d -> {
                if(!files.containsKey(d.getLocation())) {
                    files.put(d.getLocation(), getQueriesFromFile(d.getLocation()));
                }
                var queryMap = files.get(d.getLocation());
                SqlQueryHolder queryHolder = queryMap.get(d.getName());
                queries.putIfAbsent(buildQueryId(d.getLocation(), d.getName()), queryHolder);
            });

            currentQueryIndex++;
        }
    }

    private void buildDag() {
        queries.values().forEach(dag::addVertex);
        queries.values().forEach(q -> q.getDependencies().forEach(d -> {
            var queryKey = buildQueryId(d.getLocation(), d.getName());
            SqlQueryHolder depQuery = queries.get(queryKey);
            try {
                dag.addEdge(q, depQuery);
            } catch (GraphCycleProhibitedException e) {
                throw new DependencyCycleException(
                        "Edge %s -> %s would induce a cycle".formatted(q.getName(), depQuery.getName()));
            }
        }));
    }

    private Map<String, SqlQueryHolder> getQueriesFromFile( String location ) {
        String sqlFile = readFile(location);
        return sqlQueryParser.parse(sqlFile, location);
    }

    private String readFile( String location ) {

        String fullLocation = Paths.get(sourceBasePath, location).toString();

        try {
            if(isInResource) {
                return PathsUtils.readClasspathResource(fullLocation);
            } else {
                return PathsUtils.readPath(Paths.get(fullLocation));
            }
        } catch (IOException | FileNotFoundException e) {
            throw new SQLParsingException(
                    String.format("Error occurred while reading SQL queries from path: %s", location),
                    e
            );
        }
    }

    private static String buildQueryId (String queryLocation, String queryName) {
        return queryLocation + '#' + queryName;
    }

    @NotNull
    @Override
    public Iterator<SqlQueryHolder> iterator() {
        LinkedList<SqlQueryHolder> list = new LinkedList<>();
        dag.iterator().forEachRemaining(list::add);
        return list.descendingIterator();
    }

    public Iterator<SqlQueryHolder> topologicalIterator() {
        return dag.iterator();
    }

    public SqlQueryHolder getQuery (String fileLocation, String queryName) {
        return queries.get(buildQueryId(fileLocation, queryName));
    }

    public DirectedAcyclicGraph<SqlQueryHolder, DefaultEdge> getDag() {
        return dag;
    }

    public int size() {
        return queries.size();
    }
}
