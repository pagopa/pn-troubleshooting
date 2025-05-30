package it.pagopa.pn.scripts.commands.datafixes.source_channel_details;

import it.pagopa.pn.scripts.commands.datafixes.JsonTransformFunction;
import it.pagopa.pn.scripts.commands.utils.CdcFileParsedData;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

public class SourceChannelDetailsFixFunction implements JsonTransformFunction {

    private final SourceChannelDetailsFromLogCache logs;

    public SourceChannelDetailsFixFunction( String profile, String region ) {
        this.logs = new SourceChannelDetailsFromLogCache( profile, region );
    }

    @Override
    public JSONObject apply( JSONObject inJsonObj ) {
        JSONObject result;
        try {
            String iun = "##";
            if( CdcFileParsedData.checkNestedProperty( inJsonObj, "dynamodb.NewImage") ) {
                iun = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.iun.S");
            }

            if( ! iun.contains("##") ) {

                String sentAt = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.sentAt.S");

                String sourceChannel = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.sourceChannel.S");

                String sourceChannelDetails = null;
                if( CdcFileParsedData.checkNestedProperty( inJsonObj, "dynamodb.NewImage.sourceChannelDetails")) {
                    sourceChannelDetails = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.sourceChannelDetails.S");
                    sourceChannelDetails = sourceChannelDetails.trim().toUpperCase();
                }

                if( "WEB".equals( sourceChannel) ) {
                    if( sourceChannelDetails != null ) {
                        System.out.println( "== " + iun + " (sentAt: " + sentAt + ") need to BE REMOVED");
                        result = new JSONObject( inJsonObj.toString() );
                        CdcFileParsedData.removeNestedProperty( result, "dynamodb.NewImage.sourceChannelDetails" );
                    }
                    else {
                        System.out.println( "== " + iun + " (sentAt: " + sentAt + ") DO NOT need update" );
                        result = inJsonObj;
                    }
                }
                else if( "B2B".equals( sourceChannel) ) {
                    if( sourceChannelDetails == null || !ALLOWED_CHANNEL_DETAILS_VALUES.contains( sourceChannelDetails ) ) {
                        result = updateSourceChannelDetails( inJsonObj, iun );
                    }
                    else {
                        System.out.println( "== " + iun + " (sentAt: " + sentAt + ") DO NOT need update" );
                        result = inJsonObj;
                    }
                }
                else {
                    throw new RuntimeException("SOMETHNG WRONG " + inJsonObj );
                }
            }
            else {
                result = inJsonObj;
            }
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }

        return result;
    };


    private JSONObject updateSourceChannelDetails( JSONObject _jsonObj, String iun ) throws JSONException {
        JSONObject jsonObj = new JSONObject( _jsonObj.toString() );

        String sentAtString = CdcFileParsedData.getNestedProperty( jsonObj, "dynamodb.NewImage.sentAt.S");
        Instant sentAt = Instant.parse( sentAtString );

        try {
            Optional<String> newSourceChannelDetails = logs.computeSourceChannelDetails(iun, sentAt);

            if( newSourceChannelDetails.isPresent() ) {
                String newSourceChannelDetailsVal = newSourceChannelDetails.get();
                System.out.println( "== " + iun + " (sentAt: " + sentAtString + ") need update to " + newSourceChannelDetailsVal );
                CdcFileParsedData.setNestedProperty(jsonObj, "dynamodb.NewImage.sourceChannelDetails", newSourceChannelDetailsVal );
            }
            else {
                System.out.println( "== " + iun + " (sentAt: " + sentAtString + ") need to BE REMOVED");
                CdcFileParsedData.removeNestedProperty(jsonObj, "dynamodb.NewImage.sourceChannelDetails");
            }
        }
        catch (UnsupportedOperationException exc ) {
            System.out.println( "== " + iun + " sentAt " + sentAtString + " FAILED " + exc.getMessage() );

        }

        return jsonObj;
    }

    private final static Set<String> ALLOWED_CHANNEL_DETAILS_VALUES = new HashSet<>(Arrays.asList(
            "INTEROP", "NONINTEROP"
    ));

}
