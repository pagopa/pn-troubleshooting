package it.pagopa.pn.scripts.commands.datafixes.source_channel_details;

import it.pagopa.pn.scripts.commands.CommandsMain;
import it.pagopa.pn.scripts.commands.datafixes.JsonTransformFunction;
import it.pagopa.pn.scripts.commands.utils.CdcFileParsedData;
import it.pagopa.pn.scripts.commands.utils.LoadAndSaveCdcFile;
import it.pagopa.pn.scripts.commands.logs.MsgListenerImpl;
import it.pagopa.pn.scripts.commands.aws.s3client.S3ClientWrapper;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import picocli.CommandLine;
import software.amazon.awssdk.services.s3.model.S3Object;

import java.io.IOException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Callable;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@CommandLine.Command(name = "redoSourceChannelDetails")
public class SourceChannelDetailsRedoCommand implements Callable<Integer> {

    @CommandLine.ParentCommand
    CommandsMain parent;

    @CommandLine.Option(names = {"--aws-profile"})
    private String awsProfileName = "sso_pn-core-prod";

    @CommandLine.Option(names = {"--aws-region"})
    private String awsRegionCode = "eu-south-1";

    @CommandLine.Option(names = {"--aws-bucket"})
    private String bucketName = "pn-logs-bucket-eu-south-1-510769970275-001";

    @CommandLine.Option(names = {"--aws-folder"})
    private String cdcFolderPrefix = "cdcTos3/TABLE_NAME_pn-Notifications";

    @CommandLine.Option(names = {"--fixed-cdc-local-folder"})
    private String fixedCdcOutputFolderStr = "./out/fixed_cdc/notifications/sourceChannelDetails/";
    public Path getFixedCdcOutputFolder() {
        return Paths.get( fixedCdcOutputFolderStr );
    }

    @CommandLine.Parameters(index = "0", description = "Indexing starting date inclusive; ISO date in the form YYYY-MM-DD[-HH]")
    private String fromDate;

    @CommandLine.Parameters(index = "1", description = "Indexing starting date exclusive; ISO date in the form YYYY-MM-DD[-HH]")
    private String toDate;


    private final static Set<String> ALLOWED_CHANNEL_DETAILS_VALUES = new HashSet<>(Arrays.asList(
            "INTEROP", "NONINTEROP"
        ));



    public Integer call() throws Exception {
        MsgListenerImpl logger = new MsgListenerImpl();

        S3ClientWrapper s3 = new S3ClientWrapper( awsProfileName, awsRegionCode );
        s3.addListener(logger);

        SourceChannelDetailsFixFunction fixer = new SourceChannelDetailsFixFunction( awsProfileName, awsRegionCode  );
        LoadAndSaveCdcFile cdcIo = new LoadAndSaveCdcFile();

        Stream<DateHoursStream.DateHour> dates = DateHoursStream.stream(
                DateHoursStream.DateHour.valueOf( fromDate, "-", true ),
                DateHoursStream.DateHour.valueOf( toDate, "-", true ),
                DateHoursStream.TimeUnitStep.HOUR,
                true
        );


        dates.forEachOrdered( (d) -> {
            System.out.println("====== SourceChannelDetails REDO " + d.toString("-"));
            String prefix = cdcFolderPrefix + "/" + d.toString("/");
            Stream<S3Object> cdcFiles = s3.listObjectsWithPrefix( bucketName, prefix );

            cdcFiles.forEach( s3Obj -> {
                try {

                    String content = s3.getObjectContetAsString( bucketName, s3Obj );
                    CdcFileParsedData cdcData = cdcIo.loadFileOfObjects( content );
                    CdcFileParsedData fixedCdcData = fixCdcData( cdcData, fixer );

                    Path destinationFile = getFixedCdcOutputFolder().resolve( s3Obj.key() );
                    System.out.println( destinationFile );
                    cdcIo.saveFileOfObjects( destinationFile, fixedCdcData );

                } catch (IOException e) {
                    throw new RuntimeException(e);
                }
            });
        });

        return 0;
    }

    private static CdcFileParsedData fixCdcData(CdcFileParsedData cdcData, JsonTransformFunction fixer) {
        List<List<JSONObject>> fixedCdcData = cdcData.stream()
                .map( (line) ->
                    line.stream()
                        .map( fixer )
                        .collect(Collectors.toList())
                )
                .collect(Collectors.toList());
        return new CdcFileParsedData( fixedCdcData );
    }

    private static void updateSourceChannelDetails(SourceChannelDetailsFromLogCache logs, JSONObject jsonObj, String iun ) throws JSONException {
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
    }


}
