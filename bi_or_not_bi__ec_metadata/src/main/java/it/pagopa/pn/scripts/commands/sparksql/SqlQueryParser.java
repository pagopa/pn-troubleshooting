package it.pagopa.pn.scripts.commands.sparksql;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.pagopa.pn.scripts.commands.enumerations.ParserStateEnum;
import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;

import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.stream.Stream;

public class SqlQueryParser {

    private static final Pattern QUERY_SECTION_START_REGEXP = Pattern.compile("^----+$");
    private static final Predicate<String> IS_QUERY_SECTION_START = QUERY_SECTION_START_REGEXP.asMatchPredicate();

    private static final Pattern IS_METADATA_PATTERN = Pattern.compile("^-+\\$Metadata$");
    private static final Predicate<String> IS_METADATA = IS_METADATA_PATTERN.asMatchPredicate();

    private static final Pattern IS_QUERY_PATTERN = Pattern.compile("^-+\\$Query$");
    private static final Predicate<String> IS_QUERY = IS_QUERY_PATTERN.asMatchPredicate();

    private static final Pattern QUERY_SECTION_END_REGEXP = Pattern.compile("^;$");
    private static final Predicate<String> IS_QUERY_SECTION_END = QUERY_SECTION_END_REGEXP.asMatchPredicate();

    private final ObjectMapper mapper = new ObjectMapper();

    private final Map<String, SqlQueryHolder> queries = new HashMap<>();
    private final List<String> metadataLines = new LinkedList<>();
    private final List<String> queryLines = new LinkedList<>();

    private ParserStateEnum currentState;

    public Map<String, SqlQueryHolder> parse(Stream<String> stream) {

        this.onStartParsing();

        stream.sequential()
            .map(String::trim)
            .forEach(this::readLine);

        return this.queries;
    }

    private void onStartParsing() {
        this.queries.clear();
        this.metadataLines.clear();
        this.queryLines.clear();

        this.currentState = ParserStateEnum.READY;
    }

    private void readLine(String line) {

        /* Recognize current state */
        if (IS_QUERY_SECTION_START.test(line)) currentState = ParserStateEnum.BEGIN_QUERY_DEFINITION;
        if (IS_METADATA.test(line)) currentState = ParserStateEnum.READING_METADATA;
        else if (IS_QUERY.test(line)) currentState = ParserStateEnum.READING_QUERY;
        else if (IS_QUERY_SECTION_END.test(line)) currentState = ParserStateEnum.END_QUERY_DEFINITION;

        /* Otherwise cumulate reading lines */
        else {
            if (currentState.equals(ParserStateEnum.READING_METADATA)) {
                metadataLines.add(line);
            } else if (currentState.equals(ParserStateEnum.READING_QUERY)) {
                queryLines.add(line);
            }
        }

        if (currentState.equals(ParserStateEnum.END_QUERY_DEFINITION)) {
            SqlQueryHolder sqlQueryHolderFromString = readSqlQueryHolderFromString(String.join("\n", metadataLines));
            sqlQueryHolderFromString.setSqlQuery(String.join("\n", queryLines));

            queries.put(sqlQueryHolderFromString.getName(), sqlQueryHolderFromString);

            metadataLines.clear();
            queryLines.clear();

            currentState = ParserStateEnum.READY;
        }
    }

    private SqlQueryHolder readSqlQueryHolderFromString(String metadata) {
        SqlQueryHolder sqlQueryHolderFromString;

        try {
            sqlQueryHolderFromString = mapper.readValue(metadata, SqlQueryHolder.class);
        } catch (JsonProcessingException e) {
            throw new SQLParsingException(
                String.format("Error occurred during string conversion to %s", SqlQueryHolder.class),
                e
            );
        }

        return sqlQueryHolderFromString;
    }
}
