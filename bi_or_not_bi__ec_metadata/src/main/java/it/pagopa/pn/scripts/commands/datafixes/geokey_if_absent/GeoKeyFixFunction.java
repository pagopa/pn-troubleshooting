package it.pagopa.pn.scripts.commands.datafixes.geokey_if_absent;

import it.pagopa.pn.scripts.commands.aws.dynamo.DynamoJsonClient;
import it.pagopa.pn.scripts.commands.datafixes.JsonTransformFunction;
import org.apache.commons.lang3.StringUtils;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.util.*;

import static it.pagopa.pn.scripts.commands.utils.CdcFileParsedData.checkNestedProperty;
import static it.pagopa.pn.scripts.commands.utils.CdcFileParsedData.getNestedProperty;
import static it.pagopa.pn.scripts.commands.utils.CdcFileParsedData.setNestedProperty;

public class GeoKeyFixFunction implements JsonTransformFunction {

    private static final Collection<String> SEND_PAPER_CATEGORIES = Arrays.asList(
            "SEND_ANALOG_DOMICILE", "SEND_SIMPLE_REGISTERED_LETTER"
        );

    private final DynamoJsonClient dynamoClient;

    public GeoKeyFixFunction(String profile, String region ) {
        this.dynamoClient = new DynamoJsonClient( profile, region );
    }

    @Override
    public JSONObject apply( JSONObject inJsonObj ) {
        JSONObject result;
        try {
            String category = "";
            if (
                        checkNestedProperty( inJsonObj, "dynamodb.NewImage")
                    &&
                        checkNestedProperty( inJsonObj, "dynamodb.NewImage.category")
            ) {
                category = getNestedProperty( inJsonObj, "dynamodb.NewImage.category.S");
            }

            if( SEND_PAPER_CATEGORIES.contains( category ) ) {

                String timelineElementId = getNestedProperty( inJsonObj, "dynamodb.NewImage.timelineElementId.S");

                String zipCode = getNestedProperty( inJsonObj, "dynamodb.NewImage.details.M.physicalAddress.M.zip.S");
                String foreignState = getNestedProperty( inJsonObj, "dynamodb.NewImage.details.M.physicalAddress.M.foreignState.S");

                if( StringUtils.isBlank( zipCode ) && StringUtils.isBlank( foreignState ) ) {

                    // Timeline need Fix.
                    String iun = getNestedProperty( inJsonObj, "dynamodb.NewImage.iun.S");

                    JSONObject confInfo = dynamoClient.getByKey("pn-ConfidentialObjects", "TIMELINE#" + iun, timelineElementId);
                    result = fixTimelineElement( inJsonObj, confInfo, timelineElementId );
                }
                else {
                    //System.out.println( timelineElementId + " do NOT need update");
                    result = inJsonObj;
                }
            }
            else {
                result = inJsonObj;
            }
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }

        return result;
    }

    private JSONObject fixTimelineElement(JSONObject timeline, JSONObject confInfo, String timelineElementId ) throws JSONException {
        String newZipCode = getNestedProperty( confInfo, "physicalAddress.M.cap.S");
        String newForeignState = getNestedProperty( confInfo, "physicalAddress.M.state.S");

        JSONObject result = new JSONObject( timeline.toString() );

        if( newZipCode != null ) {
            setNestedProperty( result, "dynamodb.NewImage.details.M.physicalAddress.M.zip", newZipCode );
        }

        if( newForeignState != null ) {
            setNestedProperty( result, "dynamodb.NewImage.details.M.physicalAddress.M.foreignState", newForeignState );
        }

        //System.out.println( timelineElementId + " do UPDATE to zip=" + newZipCode + " state=" + newForeignState );

        return result;
    }

}
