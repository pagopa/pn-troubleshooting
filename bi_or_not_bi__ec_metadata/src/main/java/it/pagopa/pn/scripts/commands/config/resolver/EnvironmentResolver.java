package it.pagopa.pn.scripts.commands.config.resolver;

import org.apache.logging.log4j.core.lookup.StrSubstitutor;

public final class EnvironmentResolver {

    private EnvironmentResolver() {}

    public static String resolve(String text) {
        StrSubstitutor sub = new StrSubstitutor(System.getenv());
        return sub.replace(text);
    }
}
