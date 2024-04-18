package it.pagopa.pn.scripts.commands;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import it.pagopa.pn.scripts.commands.utils.StreamUtils;
import org.apache.commons.io.IOUtils;
import org.codehaus.jettison.json.JSONObject;
import org.testng.Assert;
import org.testng.annotations.Test;
import org.testng.asserts.Assertion;

import java.io.*;
import java.nio.charset.Charset;
import java.util.*;

public class JacksonReadTest {

    @Test
    public void readJsonFromStreamTest() throws IOException {

        // Given

        String jsonString = "{\"name\": \n \"pippo\"} \n jjjjjjjjjjjjjjjjjjjj {\"name\": \"pippo2\"}";
        InputStream stream = new ByteArrayInputStream(jsonString.getBytes());

        ObjectMapper mapper = new ObjectMapper();

        JsonParser p = mapper.getFactory().createParser(stream);
        Map<String, String> map = mapper.readValue(p, HashMap.class);

        StringWriter writer = new StringWriter();
        IOUtils.copy(stream, writer, "UTF-8");

        System.out.println("READ: " + stream);
        System.out.println("REMAINING: " + p.currentLocation());

        List<String> list = Arrays.asList(jsonString.split("\n"));
        List<String> remainingList = new ArrayList<>(
            list.subList(p.currentLocation().getLineNr() -1, list.size())
        );
        remainingList.set(0, remainingList.get(0).substring(p.currentLocation().getColumnNr()));

        System.out.println(remainingList);
        System.out.println(map);

        Assert.assertNotEquals(map, null);
   }
}
