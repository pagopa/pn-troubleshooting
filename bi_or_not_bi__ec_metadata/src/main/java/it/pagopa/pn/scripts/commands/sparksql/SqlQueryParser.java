package it.pagopa.pn.scripts.commands.sparksql;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.pagopa.pn.scripts.commands.config.resolver.EnvironmentResolver;
import it.pagopa.pn.scripts.commands.config.resolver.ObjectMapperResolver;
import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;

import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class SqlQueryParser {
    private static final Pattern METADATA_REGEX_MATCHER = Pattern.compile("(?s)(?i)(^|\\s+?)(/\\*)((.)(?!\\*/))*?(\\$QueryMetadata)(.*?)(\\*/)");
    private final ObjectMapper mapper = ObjectMapperResolver.getObjectMapper();

    public Map<String, SqlQueryHolder> parse(String input, String location) {
        Map<String, SqlQueryHolder> queries = new HashMap<>();
        // Dummy metadata to avoid an additional if outside while
        input += "\n/* Dummy $QueryMetadata {} */";
        Matcher matcher = METADATA_REGEX_MATCHER.matcher(input);
        SqlQueryHolder sqlQueryHolder = null;
        int lastEndPosition = 0;

        while (matcher.find()) {
            if (sqlQueryHolder != null) {
                String queryString = input.substring(lastEndPosition, matcher.start()).trim();
                sqlQueryHolder.setSqlQuery(EnvironmentResolver.resolve(queryString));
                queries.put(sqlQueryHolder.getName(), sqlQueryHolder);
            }
            lastEndPosition = matcher.end();
            // Group 6 is the inner json
            String jsonMetadata = matcher.group(6).trim();
            sqlQueryHolder = readSqlQueryHolderFromString(jsonMetadata);
            updateLocation(sqlQueryHolder, location);
        }

        return queries;
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

    private static void updateLocation(SqlQueryHolder sqlQueryHolder, String location) {
        sqlQueryHolder.setLocation(location);
        sqlQueryHolder.getDependencies().forEach(d -> {
            if (d.getLocation() == null) {
                d.setLocation(location);
            }
        });
    }
}
