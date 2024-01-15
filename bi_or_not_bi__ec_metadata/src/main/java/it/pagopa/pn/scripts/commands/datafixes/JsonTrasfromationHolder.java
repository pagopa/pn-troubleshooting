package it.pagopa.pn.scripts.commands.datafixes;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public class JsonTrasfromationHolder {

    private final Map<String, JsonTransformFunction> transformations = new LinkedHashMap<>();

    public void remove( String transformationName ) {
        this.transformations.remove( transformationName );
    }

    public void add( String transformationName, JsonTransformFunction jtf) {
        this.transformations.put( transformationName, jtf );
    }

    public JSONObject applyTransformation( JSONObject in ) {
        JSONObject result = in;
        for( Map.Entry<String, JsonTransformFunction> entry: this.transformations.entrySet() ) {
            result = entry.getValue().apply( result );
        }
        return result;
    }

    public List<String> applyTransformation( List<String> in ) {
        List<String> result;

        if( in == null || in.isEmpty() || transformations.isEmpty() ) {
            result = in;
        }
        else {
            result = in.stream()
                    .map( el -> {
                        try {
                            return new JSONObject( el );
                        } catch (JSONException e) {
                            throw new RuntimeException(e);
                        }
                    })
                    .map( this::applyTransformation )
                    .map( JSONObject::toString )
                    .toList();
        }

        return result;
    }

}
