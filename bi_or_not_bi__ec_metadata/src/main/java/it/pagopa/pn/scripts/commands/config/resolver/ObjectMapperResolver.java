package it.pagopa.pn.scripts.commands.config.resolver;

import com.fasterxml.jackson.databind.ObjectMapper;

public class ObjectMapperResolver {

    private static ObjectMapper objectMapper = null;

    private ObjectMapperResolver() {}

    public static ObjectMapper getObjectMapper() {
        if (objectMapper == null) {
            objectMapper = new ObjectMapper();
        }

        return objectMapper;
    }
}
