package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.exceptions.FileNotFoundException;
import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;
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
        } catch (IOException | FileNotFoundException e) {
            throw new SQLParsingException(
                String.format("Error occurred while reading SQL queries from path: %s", sqlFilePath.toString()),
                e
            );
        }
    }

    public static SqlQueryMap fromClasspathResource( String sqlResourceName ) {
        try {
            return new SqlQueryMap( PathsUtils.readClasspathResource( sqlResourceName ));
        } catch (IOException | FileNotFoundException e) {
            throw new SQLParsingException(
                String.format("Error occurred while reading SQL queries from path: %s", sqlResourceName),
                e
            );
        }
    }

    private final Map<String, SqlQueryHolder> queries;

    private SqlQueryMap( Stream<String> sqlFile ) {
        this.queries = parseQueryFile( sqlFile );
    }

    public SqlQueryHolder getQuery( String key ) {
        return this.queries.get(key);
    }

    public List<String> getQueriesNames() {
        return new ArrayList<>( this.queries.keySet() );
    }

    private static Map<String, SqlQueryHolder> parseQueryFile( Stream<String> sqlFile) {
        SqlQueryParser sqlQueryParser = new SqlQueryParser();
        return sqlQueryParser.parse(sqlFile);
    }
}
