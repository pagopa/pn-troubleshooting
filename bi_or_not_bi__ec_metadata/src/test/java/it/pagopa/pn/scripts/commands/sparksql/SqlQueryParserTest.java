package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;
import org.apache.commons.io.IOUtils;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.InputStream;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Stream;

public class SqlQueryParserTest {

    private SqlQueryParser parser;

    @BeforeMethod
    public void init() {
        this.parser = new SqlQueryParser();
    }

    @Test
    public void parseTestOK() throws IOException {

        // Given
        InputStream stream = ClassLoader.getSystemResourceAsStream("TestOKQuery.sql");
        if (stream == null) Assert.fail();

        // When
        Map<String, SqlQueryHolder> result = parser.parse(inputStreamToString(stream));

        // Then
        Assert.assertNotNull(result);
        Assert.assertEquals(result.size(), 3);
    }

    @Test
    public void parseMalformedJsonTestKO() throws SQLParsingException {

        // Given
        InputStream stream = ClassLoader.getSystemResourceAsStream("TestMalformedJsonQuery.sql");
        if (stream == null) Assert.fail();

        // When - Then
        Assert.assertThrows(SQLParsingException.class, () -> parser.parse(inputStreamToString(stream)));
    }

    private Stream<String> inputStreamToLines(InputStream inputStream) throws IOException {
        StringWriter writer = new StringWriter();
        IOUtils.copy(inputStream, writer, StandardCharsets.UTF_8);
        String[] lines = writer.toString().split("\n");

        return Arrays.stream(lines);
    }

    private static String inputStreamToString(InputStream input) throws IOException {
        return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }


}
