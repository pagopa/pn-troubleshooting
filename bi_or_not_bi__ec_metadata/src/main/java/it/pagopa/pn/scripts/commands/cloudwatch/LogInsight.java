package it.pagopa.pn.scripts.commands.cloudwatch;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient;
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClientBuilder;
import software.amazon.awssdk.services.cloudwatchlogs.model.*;
import software.amazon.awssdk.utils.StringUtils;

import java.util.*;

public class LogInsight {

    private String profileName;
    private String regionCode;

    private CloudWatchLogsClient cloudwatchLogs;

    public LogInsight( String profileName, String regionCode) {
        this.profileName = profileName;
        this.regionCode = regionCode;

        this.cloudwatchLogs = createClient( profileName, regionCode);
    }

    private CloudWatchLogsClient createClient(  String profileName, String regionCode ) {
        CloudWatchLogsClientBuilder builder = CloudWatchLogsClient.builder();

        if( StringUtils.isNotBlank( profileName )) {
            builder.credentialsProvider( ProfileCredentialsProvider.create( profileName ));
        }

        if( StringUtils.isNotBlank( regionCode )) {
            builder.region( Region.of( regionCode ));
        }

        return builder.build();
    }

    public List<JSONObject> executeLogInsightQuery(Collection<String> logGroupsNames, long fromEpochMs, long toEpochMs, String query ) {
        busyWait( 2 );

        StartQueryRequest startRequest = StartQueryRequest.builder()
                .logGroupNames( logGroupsNames )
                .startTime( fromEpochMs )
                .endTime( toEpochMs )
                .queryString( query )
                .build();

        StartQueryResponse startResponse = cloudwatchLogs.startQuery( startRequest );

        List<JSONObject> logs = null;
        while ( logs == null ) {
            busyWait( 2 );

            try {
                logs = this.fetchQueryResult( startResponse.queryId() );
            }
            catch( Exception exc ) {
                exc.printStackTrace();
                busyWait( 20 );
            }
        }

        return logs;
    }

    private List<JSONObject> fetchQueryResult(String queryId) {
        GetQueryResultsRequest request = GetQueryResultsRequest.builder()
                .queryId(queryId)
                .build();

        GetQueryResultsResponse response = this.cloudwatchLogs.getQueryResults(request);

        List<List<ResultField>> logs;
        switch ( response.status() ) {
            case RUNNING, SCHEDULED -> logs = null;
            case COMPLETE -> logs = response.results();
            default ->  logs = Collections.emptyList();
        }

        return remapToJson( logs );
    }

    private List<JSONObject> remapToJson(List<List<ResultField>> logs) {
        try {
            List<JSONObject> result;
            if (logs == null) {
                result = null;
            } else {
                result = new ArrayList<>();
                for (List<ResultField> fields : logs) {
                    JSONObject jsonObj = new JSONObject();
                    for (ResultField f : fields) {
                        jsonObj.put(f.field(), f.value());
                    }
                    result.add( jsonObj );
                }
            }
            return result;
        }
        catch (JSONException exc) {
            throw new RuntimeException( exc );
        }
    }

    private void busyWait( int seconds) {
        try {
            Thread.sleep( seconds * 1000l );
        } catch (InterruptedException e) {
            throw new RuntimeException(e);
        }
    }


}
