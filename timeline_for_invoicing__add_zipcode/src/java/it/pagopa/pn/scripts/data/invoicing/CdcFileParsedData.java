package it.pagopa.pn.scripts.data.invoicing;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.util.*;

public class CdcFileParsedData extends ArrayList<List<JSONObject>> {

    public CdcFileParsedData( List<List<JSONObject>> list ) {
        super( list );
    }

    public static String getNestedProperty( JSONObject root, String path) throws JSONException {
        String[] pathSteps = path.split("\\.");

        JSONObject item = getParentObject( root, pathSteps );

        String lastStep = pathSteps[pathSteps.length - 1];

        String result = null;
        if( item.has( lastStep )) {
            result = item.getString( lastStep );
        }

        return result;
    }

    public static void setNestedProperty( JSONObject root, String path, String value) throws JSONException {
        setNestedProperty( root, path, value, "S");
    }
    public static void setNestedProperty( JSONObject root, String path, String value, String type) throws JSONException {
        String[] pathSteps = path.split("\\.");

        JSONObject item = getParentObject( root, pathSteps );

        item.put( pathSteps[pathSteps.length - 1], Collections.singletonMap( type, value));
    }

    private static JSONObject getParentObject( JSONObject root, String[] pathSteps ) throws JSONException {
        JSONObject item = root;
        for(int i = 0; i< pathSteps.length - 1; i++ ) {
            item = item.getJSONObject( pathSteps[i] );
        }
        return item;
    }



}
