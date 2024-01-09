package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.utils.PathsUtils;
import org.jetbrains.annotations.NotNull;

import java.io.IOException;
import java.nio.file.Path;
import java.util.*;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class SqlQueryMap {

    public static SqlQueryMap fromPath( Path sqlFilePath ) {
        try {
            return new SqlQueryMap( PathsUtils.readPath( sqlFilePath ));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static SqlQueryMap fromClasspathResource( String sqlResourceName ) {
        try {
            return new SqlQueryMap( PathsUtils.readClasspathResource( sqlResourceName ));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    private final Map<String, String > queries;

    private SqlQueryMap( Stream<String> sqlFile ) {
        this.queries = parseQueryFile( sqlFile );
    }

    public String getQuery( String key ) {
        return this.queries.get( key );
    }

    public List<String> getQueriesNames() {
        return new ArrayList<>( this.queries.keySet() );
    }

    private static Map<String, String > parseQueryFile( Stream<String> sqlFile) {

        QueryFileParser parser = new QueryFileParser();

        sqlFile.sequential()
                .forEach( parser::parseLine );

        return parser.getQueries();
    }


    private static class QueryFileParser {

        private static final Pattern QUERY_SECTION_START_REGEXP = Pattern.compile("^----+$");
        private static final Predicate<String> IS_QUERY_SECTION_START =
                QUERY_SECTION_START_REGEXP.asMatchPredicate();

        private static final Pattern IS_HEADER_PATTERN = Pattern.compile("^--.*$");
        private static final Predicate<String> IS_HEADER = IS_HEADER_PATTERN.asMatchPredicate();

        private static final Pattern QUERY_END_REGEXP = Pattern.compile("^;$");
        private static final Predicate<String> IS_QUERY_END = QUERY_END_REGEXP.asMatchPredicate();

        private static final Pattern QUERY_HEADER_REGEXP = Pattern.compile(
                "^-- *([A-Za-z0-9_][A-Za-z0-9_-]*).*$"
        );
        private static final int QUERY_HEADER_KEY_GRP_NUMBERREGEXP = 1;



        private Map<String, String > queries = new LinkedHashMap<>();

        public Map<String, String> getQueries() {
            return queries;
        }

        private String currentKey = null;
        private List<String> currentQuery = new ArrayList<>();


        private void parseLine(@NotNull String line ) {
            String trimmedLine = line.trim();

            if( IS_QUERY_SECTION_START.test( trimmedLine )) {
                currentKey = null;
            }
            else if( IS_HEADER.test( trimmedLine )) {
                Matcher matcher = QUERY_HEADER_REGEXP.matcher( trimmedLine );
                if( matcher.matches() ) {
                    String newKey = matcher.group( QUERY_HEADER_KEY_GRP_NUMBERREGEXP );
                    currentKey = newKey;
                    currentQuery = new ArrayList<>();
                }
            }
            else if( currentKey != null && IS_QUERY_END.test( trimmedLine )) {
                String queryText = String.join( "\n", currentQuery );

                queries.put( currentKey, queryText );

                currentKey = null;
            }
            else if( currentKey != null ) {
                currentQuery.add( line );
            }
            else {
                // Ignore lines before first query section start
                // AND
                // Ignore lines after a query end and before successive query section start
            }
        }
    }

}
