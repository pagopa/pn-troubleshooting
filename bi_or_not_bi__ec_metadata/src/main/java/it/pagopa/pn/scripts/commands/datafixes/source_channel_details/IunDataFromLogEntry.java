package it.pagopa.pn.scripts.commands.datafixes.source_channel_details;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.util.Base64;
import java.util.Objects;

public record IunDataFromLogEntry(
        String notificationRequestId,
        String iun,
        String uid,
        boolean uidAreEquals,
        String sourceChannelDetails,
        boolean resolved,
        String traceId
) {

    private static final String NOT_AVAILABLE_STRING = "N/A";

    public static IunDataFromLogEntry fromMassiveQueryResult( JSONObject row ) {
        try {
            String responseMessage = row.getString( "latest_message" );
            if( responseMessage.startsWith("Invoked operationId") ) {
                responseMessage = row.getString("earliest_message");
            }

            String uid = row.getString("start_uid");
            boolean uidAreEquals = Objects.equals( row.getString("start_uid"), row.getString("latest_uid") );
            String sourceChannelDetails;
            if( uid.startsWith("APIKEY-") ) {
                sourceChannelDetails = "NONINTEROP";
            }
            else if( uid.startsWith("PDND-") ) {
                sourceChannelDetails = "INTEROP";
            }
            else {
                sourceChannelDetails = null;
            }

            String notificationRequestId = NOT_AVAILABLE_STRING;
            String iun = NOT_AVAILABLE_STRING;
            boolean resolved = false;

            if( ! Objects.equals(
                    row.getString("latest_message"),
                    row.getString("earliest_message")
            )) {
                notificationRequestId = responseMessage.replaceFirst(
                        ".*notificationRequestId=([^,]*),.*",
                        "$1"
                    );
                iun = new String( Base64.getDecoder().decode( notificationRequestId ));
                resolved = true;
            }

            return new IunDataFromLogEntry(
                    notificationRequestId,
                    iun,
                    uid,
                    uidAreEquals,
                    sourceChannelDetails,
                    resolved,
                    row.getString("trace_id")
            );
        }
        catch (JSONException exc ) {
            throw new RuntimeException( exc );
        }
    }

}
