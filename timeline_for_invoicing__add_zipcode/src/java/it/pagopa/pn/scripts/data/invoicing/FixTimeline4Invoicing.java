package it.pagopa.pn.scripts.data.invoicing;

import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;

import static it.pagopa.pn.scripts.data.invoicing.CdcFileParsedData.getNestedProperty;
import static it.pagopa.pn.scripts.data.invoicing.CdcFileParsedData.setNestedProperty;

public class FixTimeline4Invoicing {

    public static final Collection<String> CAP_CATEGORIES = Collections.unmodifiableList(Arrays.asList(
      "SEND_SIMPLE_REGISTERED_LETTER", "SEND_ANALOG_DOMICILE"
    ));

    private final ConfinfoMap confinfoMap;
    private final CdcFileTransformer cdcFileTransformer;

    public FixTimeline4Invoicing( Path confinfoPath ) throws IOException, JSONException {

        ConfinfoMap confinfo = new ConfinfoMap();
        confinfo.load( confinfoPath );

        this.confinfoMap = confinfo;
        this.cdcFileTransformer = new CdcFileTransformer();
    }

    public void transform(Path fromDir, Path toDir) throws IOException {
        Map<String, JSONObject> originalTimelineForInvoicingMap = new HashMap<>();
        
        System.out.println("Start timeline precomputation");
        this.cdcFileTransformer.walkSource( fromDir, data -> this.collectInvoicingTimelinesInto_wrapException( data, originalTimelineForInvoicingMap) );
        
        System.out.println("Start timeline trasformation");
        this.cdcFileTransformer.transform( fromDir, toDir, data -> this.transformOneFileData_wrapException( data, originalTimelineForInvoicingMap ) );
    }

    protected void collectInvoicingTimelinesInto_wrapException( CdcFileParsedData data, Map<String, JSONObject> holder) {
        try {
            this.collectInvoicingTimelinesInto( data, holder );
        } catch (JSONException exc) {
            throw new RuntimeException( exc );
        }
    }

    private void collectInvoicingTimelinesInto( CdcFileParsedData data, Map<String, JSONObject> holder) throws JSONException {
        for( List<JSONObject> lineData : data ) {
            for( JSONObject jsonObj: lineData ) {
                String timelineElementId = getNestedProperty(jsonObj, "dynamodb.NewImage.timelineElementId.S");
                holder.put( timelineElementId, jsonObj );
            }
        }
    }

    protected CdcFileParsedData transformOneFileData_wrapException( CdcFileParsedData data, Map<String, JSONObject> originalTimelineForInvoicingMap ) {
        try {
            return this.transformOneFileData( data, originalTimelineForInvoicingMap );
        } catch (JSONException exc) {
            throw new RuntimeException( exc );
        }
    }
    protected CdcFileParsedData transformOneFileData( CdcFileParsedData data, Map<String, JSONObject> originalTimelineForInvoicingMap ) throws JSONException {

        for( List<JSONObject> lineData : data ) {
            for( JSONObject m: lineData ) {

                String category = getNestedProperty( m, "dynamodb.NewImage.category.S");
                if( CAP_CATEGORIES.contains( category )) {

                    String timelineElementId = getNestedProperty( m, "dynamodb.NewImage.timelineElementId.S");
                    String paId = getNestedProperty(m, "dynamodb.NewImage.paId.S");
                    JSONObject confinfoEntry = this.confinfoMap.getTimelineInfo( timelineElementId );
                    String zipCode = getNestedProperty( confinfoEntry, "physicalAddress.M.cap.S");
                    String foreignState = getNestedProperty( confinfoEntry, "physicalAddress.M.state.S");
                    System.out.println( timelineElementId + ") " + zipCode + " " + foreignState );

                    setNestedProperty( m, "dynamodb.NewImage.details.M.physicalAddress.M.zip", zipCode );
                    if( foreignState != null ) {
                        setNestedProperty( m, "dynamodb.NewImage.details.M.physicalAddress.M.foreignState", foreignState );
                    }


                    String invoicingTimestamp = findRefinementTimestamp( originalTimelineForInvoicingMap, timelineElementId );
                    invoicingTimestamp = invoicingTimestamp.replaceFirst("\\.([0-9]{3})[0-9]+Z", ".$1Z");
                    setNestedProperty( m, "dynamodb.NewImage.invoincingTimestamp", invoicingTimestamp );

                    String invoicingDay = invoicingTimestamp.replaceFirst("T.*", "");
                    setNestedProperty( m, "dynamodb.NewImage.invoicingDay", invoicingDay );

                    String paId_invoicingDay = paId + "_" + invoicingDay;
                    setNestedProperty( m, "dynamodb.NewImage.paId_invoicingDay", paId_invoicingDay );
                    setNestedProperty( m, "dynamodb.Keys.paId_invoicingDay", paId_invoicingDay );

                    String invoincingTimestamp_timelineElementId = invoicingTimestamp + "_" + timelineElementId;
                    setNestedProperty( m, "dynamodb.NewImage.invoincingTimestamp_timelineElementId", invoincingTimestamp_timelineElementId);
                    setNestedProperty( m, "dynamodb.Keys.invoincingTimestamp_timelineElementId", invoincingTimestamp_timelineElementId);

                    long YEAR_SECONDS = 365 * 24 * 3600l;
                    long ttl = Instant.parse( invoicingTimestamp ).getEpochSecond() + YEAR_SECONDS;
                    setNestedProperty( m, "dynamodb.NewImage.ttl", "" + ttl, "N");

                    if( timelineElementId == null || paId == null || zipCode == null || invoicingTimestamp == null || invoicingDay == null ) {
                        throw new RuntimeException("SOMZING IS NULL");
                    }
                }

            }
        }

        return data;
    }

    private String findRefinementTimestamp(Map<String, JSONObject> originalTimelineForInvoicingMap, String timelineElementId) throws JSONException {
        // NOTIFICA RIFIUTATA
        // NOTIFICA PERFEZIONATA PER DECORRENZA TERMINI
        // NOTIFICA VISUALIZZATA
        String iun_recIdx = timelineElementId.replaceFirst("^[^\\.]+\\.IUN_([^\\.]+)\\.RECINDEX_([0-9]+).*", "$1#$2");
        String[] iun_recIdx_arr = iun_recIdx.split("#");
        String iun = iun_recIdx_arr[0];
        String recIdx = iun_recIdx_arr[1];

        String notificationRefusedTimelineElementId = "REQUEST_REFUSED.IUN_" + iun;
        String notificationViewedTimelineElementId = "NOTIFICATION_VIEWED.IUN_" + iun + ".RECINDEX_" + recIdx;
        String notificationRefinedTimelineElementId = "REFINEMENT.IUN_" + iun + ".RECINDEX_" + recIdx;

        String refinementTimestamp = computeRefinementTimestamp(
                originalTimelineForInvoicingMap,
                notificationRefusedTimelineElementId,
                notificationViewedTimelineElementId,
                notificationRefinedTimelineElementId
            );

        System.out.println( "ELEMENT_ID: " + timelineElementId + " iun: " + iun + " recIdx: " + recIdx );
        return refinementTimestamp;
    }

    private String computeRefinementTimestamp(Map<String, JSONObject> originalTimelineForInvoicingMap, String ... timelineIds) throws JSONException {

        List<String> timestamps = new ArrayList<>();

        for( String timelineElementId: timelineIds ) {
            JSONObject timelineEl = originalTimelineForInvoicingMap.get( timelineElementId );
            if( timelineEl != null ) {
                String timestamp = getNestedProperty( timelineEl, "dynamodb.NewImage.timestamp.S");
                if( timestamp != null ) {
                    timestamps.add( timestamp );
                }
            }
        }

        String timestamp = timestamps.stream().max( Comparator.naturalOrder() ).get();
        return timestamp;
    }


    public static void main(String[] args) throws IOException, JSONException {
        String confinfoPathStr = args[1];
        String cdcDirStr = args[2];
        String newCdcDirStr = args[3];
        
        Path confinfoPath = Paths.get( confinfoPathStr );
        Path cdcDir = Paths.get( cdcDirStr );
        Path newCdcDir = Paths.get( newCdcDirStr );

        FixTimeline4Invoicing application = new FixTimeline4Invoicing( confinfoPath );
        application.transform( cdcDir, newCdcDir );

    }

}
