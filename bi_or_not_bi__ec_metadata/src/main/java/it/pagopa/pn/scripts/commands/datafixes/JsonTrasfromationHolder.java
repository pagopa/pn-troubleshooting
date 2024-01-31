package it.pagopa.pn.scripts.commands.datafixes;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.util.*;

public class JsonTrasfromationHolder {

    private final Map<String, JsonTransformInfo> transformations = new LinkedHashMap<>();

    public void remove( String transformationName ) {
        this.transformations.remove( transformationName );
    }

    public void add(String transformationName, JsonTransformFunction jtf, Collection<JsonTransformFlag> flags) {
        this.transformations.put( transformationName, new JsonTransformInfo( jtf, new HashSet<>(flags)));
    }

    public JSONObject applyTransformation( JSONObject in ) {
        JSONObject result = in;
        for( Map.Entry<String, JsonTransformInfo> entry: this.transformations.entrySet() ) {
            JsonTransformInfo transformInfo = entry.getValue();
            if( transformInfo.isLenient() ) {
                try {
                    result = transformInfo.function().apply( result );
                }
                catch ( RuntimeException exc ) {
                    exc.printStackTrace();
                }
            }
            else {
                result = transformInfo.function().apply( result );
            }
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

    private record JsonTransformInfo( JsonTransformFunction function, Set<JsonTransformFlag> flags ) {

        public boolean isLenient() {
            return flags != null && flags.contains( JsonTransformFlag.LENIENT );
        }
    }

}
