package it.pagopa.pn.scripts.commands.datafixes.source_channel_details;

import it.pagopa.pn.scripts.commands.aws.cloudwatch.LogInsight;
import org.codehaus.jettison.json.JSONObject;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.stream.Collectors;

public class ComputeSourceChannelDetailsFromLog {

    public static final int MASSIVE_EXTRACTION_QUERY_LIMIT = 10 * 1000; // 10'000 is the maximum allowed by aws
    private final LogInsight logsClient;

    public ComputeSourceChannelDetailsFromLog( String profile, String region ) {
        this.logsClient = new LogInsight( profile, region );
    }

    public List<IunDataFromLogEntry> extractSourceChannelDetailsMassive( Instant from, Instant to ) {
        long fromEpochMs = from.getEpochSecond() * 1000l;
        long toEpochMs = to.getEpochSecond() * 1000l;

        List<JSONObject> logs = logsClient.executeLogInsightQuery(
                              LOG_GROUPS_LIST , fromEpochMs, toEpochMs,
                                         MASSIVE_EXTRACTION_QUERY, MASSIVE_EXTRACTION_QUERY_LIMIT);


        return logs.stream()
                .map( IunDataFromLogEntry::fromMassiveQueryResult )
                .collect(Collectors.toList());
    }

    private static final String MASSIVE_EXTRACTION_QUERY = "" +
            "stats " +
            "    earliest(@timestamp) as start_time," +
            "    latest(@timestamp) as end_time," +
            "    earliest(message) as earliest_message," +
            "    latest(message) as latest_message," +
            "    earliest(uid) as start_uid," +
            "    latest(uid) as latest_uid" +
            "  by trace_id " +
            "| filter " +
            "      @message like \"Successful API operation: NewNotificationApi._sendNewNotificationV21\" " +
            "    or " +
            "      @message like \"Invoked operationId NewNotificationApi._sendNewNotificationV21\" " +
            "| sort start_time asc";

    private static final String SINGLE_ERROR_EXTRACTION_QUERY = "" +
            "fields @message" +
            "| filter " +
            "      message like \"[AUD_NT_INSERT] FAILURE\" " +
            "    and " +
            "      trace_id like \"%trace_id%\" " +
            "| sort @timestamp desc";

    private static final List<String> LOG_GROUPS_LIST = Arrays.asList("/aws/ecs/pn-delivery");


}
