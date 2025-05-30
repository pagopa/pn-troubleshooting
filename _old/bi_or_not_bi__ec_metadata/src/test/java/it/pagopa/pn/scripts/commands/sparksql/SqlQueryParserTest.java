package it.pagopa.pn.scripts.commands.sparksql;

import it.pagopa.pn.scripts.commands.exceptions.SQLParsingException;
import org.testng.Assert;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

public class SqlQueryParserTest {

    private SqlQueryParser parser;

    @BeforeMethod
    public void init() {
        this.parser = new SqlQueryParser();
    }

    @Test
    public void parseTestOK() throws IOException {

        // Given
        String location = "TestOKQuery.sql";
        InputStream stream = ClassLoader.getSystemResourceAsStream("TestOKQuery.sql");
        if (stream == null) Assert.fail();

        // When
        Map<String, SqlQueryHolder> result = parser.parse(inputStreamToString(stream), location);

        // Then
        Assert.assertNotNull(result);
        Assert.assertEquals(result.size(), 3);
    }

    @Test
    public void parseMalformedJsonTestKO() throws SQLParsingException {

        // Given
        String location = "TestMalformedJsonQuery.sql";
        InputStream stream = ClassLoader.getSystemResourceAsStream(location);
        if (stream == null) Assert.fail();

        // When - Then
        Assert.assertThrows(SQLParsingException.class, () -> parser.parse(inputStreamToString(stream), location));
    }

    private static String inputStreamToString(InputStream input) throws IOException {
        return new String(input.readAllBytes(), StandardCharsets.UTF_8);
    }


}
