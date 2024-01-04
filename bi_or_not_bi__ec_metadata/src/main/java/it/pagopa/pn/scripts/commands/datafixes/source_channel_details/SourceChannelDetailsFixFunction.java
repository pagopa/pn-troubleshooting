package it.pagopa.pn.scripts.commands.datafixes.source_channel_details;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.datafixes.CdcFixFunction;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.s3client.S3FileLister;
import it.pagopa.pn.scripts.commands.utils.CdcFileParsedData;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import it.pagopa.pn.scripts.commands.utils.LoadAndSaveCdcFile;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import picocli.CommandLine;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.stream.Stream;

public class SourceChannelDetailsFixFunction implements CdcFixFunction {

    private final SourceChannelDetailsFromLogCache logs;

    public SourceChannelDetailsFixFunction( String profile, String region ) {
        this.logs = new SourceChannelDetailsFromLogCache( profile, region );
    }

    @Override
    public JSONObject apply( JSONObject inJsonObj ) {
        JSONObject result;
        try {
            String iun = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.iun.S");

            if( ! iun.contains("##") ) {

                String sourceChannel = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.sourceChannel.S");

                String sourceChannelDetails = null;
                if( CdcFileParsedData.checkNestedProperty( inJsonObj, "dynamodb.NewImage.sourceChannelDetails")) {
                    sourceChannelDetails = CdcFileParsedData.getNestedProperty( inJsonObj, "dynamodb.NewImage.sourceChannelDetails.S");
                    sourceChannelDetails = sourceChannelDetails.trim().toUpperCase();
                }

                if( "WEB".equals( sourceChannel) ) {
                    if( sourceChannelDetails != null ) {
                        System.out.println( "== " + iun + " need to BE REMOVED");
                        result = new JSONObject( inJsonObj.toString() );
                        CdcFileParsedData.removeNestedProperty( result, "dynamodb.NewImage.sourceChannelDetails" );
                    }
                    else {
                        System.out.println( "== " + iun + " DO NOT need update" );
                        result = inJsonObj;
                    }
                }
                else if( "B2B".equals( sourceChannel) ) {
                    if( sourceChannelDetails == null || !ALLOWED_CHANNEL_DETAILS_VALUES.contains( sourceChannelDetails ) ) {
                        result = updateSourceChannelDetails( inJsonObj, iun );
                    }
                    else {
                        System.out.println( "== " + iun + " DO NOT need update" );
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
                System.out.println( "== " + iun + " need update to " + newSourceChannelDetailsVal );
                CdcFileParsedData.setNestedProperty(jsonObj, "dynamodb.NewImage.sourceChannelDetails", newSourceChannelDetailsVal );
            }
            else {
                System.out.println( "== " + iun + " need to BE REMOVED");
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
