package it.pagopa.pn.scripts.commands.config.resolver;

import org.apache.logging.log4j.core.lookup.StrSubstitutor;

/**
 * This class has the aim to resolve environment variables
 * */
public final class EnvironmentResolver {

    private EnvironmentResolver() {}

    /**
     * Resolves JVM System Properties within a string text
     *
     * @param text the string to resolve
     *
     * @return resolved string
     * */
    public static String resolve(String text) {
        StrSubstitutor sub = new StrSubstitutor(System.getProperties());
        return sub.replace(text);
    }
}
