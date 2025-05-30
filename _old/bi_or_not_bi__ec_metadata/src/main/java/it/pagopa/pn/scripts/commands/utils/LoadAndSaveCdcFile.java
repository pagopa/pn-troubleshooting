package it.pagopa.pn.scripts.commands.utils;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class LoadAndSaveCdcFile {

    public CdcFileParsedData loadFileOfObjects(String content ) throws IOException {
        List<List<JSONObject>> lines = Arrays.stream( content.split("\n") )
                .map( this::splitLineWithMultipleJsonObjects )
                .map( this::arrayOfString2ListOfMap)
                .collect(Collectors.toList());

        return new CdcFileParsedData( lines );
    }

    public CdcFileParsedData loadFileOfObjects(Path inFilePath ) throws IOException {
        List<List<JSONObject>> lines = Files.readAllLines(inFilePath)
                .stream()
                .map( this::splitLineWithMultipleJsonObjects )
                .map( this::arrayOfString2ListOfMap)
                .collect(Collectors.toList());

        return new CdcFileParsedData( lines );
    }

    private String[] splitLineWithMultipleJsonObjects( String line) {
        String[] jsonObjectsStrings = line.split("\\} *\\{");

        // - re-integrate brackets removed by split
        for( int i = 0; i < jsonObjectsStrings.length; i++ ) {

            String str = jsonObjectsStrings[ i ];

            if( jsonObjectsStrings.length > 1 ) {
                if( i == 0 ) {
                    str = str + "}";
                }
                else if( i == jsonObjectsStrings.length - 1 ) {
                    str = "{" + str;
                }
                else {
                    str = "{" + str + "}";
                }
            }

            jsonObjectsStrings[ i ] = str;
        }

        return jsonObjectsStrings;
    }

    private List<JSONObject> arrayOfString2ListOfMap( String[] jsonObjStrings ) {

        return Arrays.asList( jsonObjStrings )
                .stream()
                .map( this::oneJsonObjString2map )
                .collect    (Collectors.toList());
    }

    private JSONObject oneJsonObjString2map(String jsonObjString ) {
        try {
            JSONObject map = new JSONObject( jsonObjString );
            return map;
        }
        catch( JSONException exc ) {
            System.out.println("Error parsing: \n" + jsonObjString );
            throw new RuntimeException( exc );
        }
    }

    public void saveFileOfObjects(Path destinationPath, CdcFileParsedData newData) throws IOException {

        String text = newData.stream()
                .map( oneLineOfObjects -> objListToString( oneLineOfObjects) )
                .collect(Collectors.joining("\n"));

        text = text.replaceAll("\\\\/", "/");

        Files.createDirectories( destinationPath.getParent() );

        Files.writeString( destinationPath, text,
                StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING );
    }

    private String objListToString(List<JSONObject> oneLineOfObjects) {

        return oneLineOfObjects.stream()
                .map( obj -> mapToJsonObjectString( obj ))
                .collect(Collectors.joining(" "));
    }

    private String mapToJsonObjectString(JSONObject map) {
        try {
            return map.toString();
        }
        catch( RuntimeException exc ) {
            System.out.println("Error serializing: \n" + map );
            throw exc;
        }
    }
}
