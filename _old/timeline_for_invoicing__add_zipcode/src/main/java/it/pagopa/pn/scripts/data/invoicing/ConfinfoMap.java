package it.pagopa.pn.scripts.data.invoicing;

import org.codehaus.jettison.json.JSONArray;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;
import java.util.zip.GZIPInputStream;

public class ConfinfoMap {

    public static final String KEY_SEP = "-##-";
    private Map<String, String> loadedValues = null;

    public void load( Path confobjects ) throws IOException, JSONException {

        Stream<JSONObject> allItems = Files.walk( confobjects )
                .filter( dataPath -> Files.isRegularFile( dataPath ) )
                .flatMap( dataPath-> {
                    try {
                        return readPathLineByLine( dataPath );
                    } catch (IOException exc) {
                        throw new RuntimeException( exc );
                    }
                })
                .map( itemLine -> {
                    try {
                        return new JSONObject( itemLine );
                    } catch (JSONException e) {
                        throw new RuntimeException(e);
                    }
                })
                .map( itemWrapperObject -> {
                    try {
                        return itemWrapperObject.getJSONObject("Item");
                    } catch (JSONException e) {
                        throw new RuntimeException(e);
                    }
                });


        Map<String, String> loadingValues = new HashMap<>();

        allItems.forEach( item -> {
            try {
                String sortKey = getFirstLevelString( item, "sortKey" );
                String hashKey = getFirstLevelString( item, "hashKey" );
                String fullKey = hashKey + "-##-" + sortKey;

                loadingValues.put( fullKey, item.toString() );

                int loadingValuesSize = loadingValues.size();
                if( loadingValuesSize % (100*1000) == 0 ) {
                    System.out.println("Loaded " + (loadingValuesSize/1000) + " confinfo");
                }

            } catch (JSONException e) {
                throw new RuntimeException(e);
            }

        });

        System.out.println("END: Loaded " + loadingValues.size() + " confinfo");
        this.loadedValues = loadingValues;
    }

    public JSONObject getTimelineInfo( String timelineElementId ) {
        String iun = timelineElementId
                .replaceFirst(".*\\.IUN_", "")
                .replaceFirst("\\..*", "");

        String fullKey = "TIMELINE#" + iun + KEY_SEP + timelineElementId;
        String jsonString = this.loadedValues.get( fullKey );

        try {
            return new JSONObject( jsonString );
        } catch (JSONException exc) {
            throw new RuntimeException("gettingTimelineInfo " + fullKey, exc);
        }
    }


    private static String getFirstLevelString( JSONObject item, String propertyName ) throws JSONException {
        return item.getJSONObject( propertyName ).getString("S");
    }


    private static Stream<String> readPathLineByLine(Path path) throws IOException {
      Stream<String> stream;
      
      if( isGzip( path ) ) {
        stream = readGzipLineByLine( path );
      }
      else {
        stream = Files.lines( path );
      }

      return stream;
    }

    private static boolean isGzip(Path path) {
      return path.toString().endsWith(".gz");
    }

    private static Stream<String> readGzipLineByLine(Path path) throws IOException {
      InputStream fileIs = Files.newInputStream(path);
      // Even though GZIPInputStream has a buffer it reads individual bytes
      // when processing the header, better add a buffer in-between
      BufferedInputStream bufferedIs = new BufferedInputStream(fileIs, 65535);
      GZIPInputStream gzipIs = new GZIPInputStream(bufferedIs);
      BufferedReader reader = new BufferedReader(new InputStreamReader(gzipIs));
      
      return reader.lines();  
    }

}
