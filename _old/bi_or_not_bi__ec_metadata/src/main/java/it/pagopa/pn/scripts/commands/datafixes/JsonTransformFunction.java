package it.pagopa.pn.scripts.commands.datafixes;

import org.codehaus.jettison.json.JSONObject;

import java.util.function.Function;

public interface JsonTransformFunction extends Function<JSONObject, JSONObject> {

}
