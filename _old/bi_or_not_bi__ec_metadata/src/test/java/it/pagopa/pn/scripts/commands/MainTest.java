package it.pagopa.pn.scripts.commands;

import org.testng.Assert;
import org.testng.annotations.Test;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.services.sts.StsClient;
import software.amazon.awssdk.services.sts.StsClientBuilder;
import software.amazon.awssdk.utils.StringUtils;

import java.io.*;
import java.util.function.BiFunction;

public class MainTest {

    @Test
    public void exportNotificationWithFix() throws IOException {
        String env = "prod";
        String profile = "sso_pn-core-" + env;
        String awsAccountId = this.getAwsAccountId( profile );

        System.setProperty("dumpToTmp", "false");

        String indexCdcCore = "cdcIndexing " +
                " --aws-profile " + profile + " " +
                " --aws-bucket pn-logs-bucket-eu-south-1-" + awsAccountId + "-001 " +
                //" --result-upload-url s3://pn-datamonitoring-eu-south-1-" + awsAccountId + "/parquet/ " +
                "";

        String repeatSubcommand = " --cdc-indexed-data-folder ./out/prove/cdc " +
                indexCdcCore + " pn-Notifications 2023-6-1 2023-12-1 " +
                "jsonTransform --aws-profile " + profile + " + fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2023-12-1 2024-1-5 " +
                "jsonTransform - fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2024-1-5 2055-1-1 ";

        int exitCode = CommandsMain.doMain( repeatSubcommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    @Test
    public void exportTimelineWithFix() throws IOException {
        String env = "prod";
        String profile = "sso_pn-core-" + env;
        String awsAccountId = this.getAwsAccountId( profile );

        System.setProperty("dumpToTmp", "true");

        String indexCdcCore = "cdcIndexing " +
                              " --aws-profile " + profile + " " +
                              " --aws-bucket pn-logs-bucket-eu-south-1-" + awsAccountId + "-001 " +
                              //" --result-upload-url s3://pn-datamonitoring-eu-south-1-" + awsAccountId + "/parquet/ " +
                              "";

        String repeatSubcommand = " --cdc-indexed-data-folder ./out/prove/cdc " +
                "jsonTransform --aws-profile sso_pn-confinfo-" + env + " + fixGeoKey " +
                indexCdcCore + " pn-Timelines 2023-06-1 2023-9-21 " +
                "jsonTransform - fixGeoKey " +
                indexCdcCore + " pn-Timelines 2023-9-21 2055-1-1 ";

        int exitCode = CommandsMain.doMain( repeatSubcommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }


    @Test
    public void exportDynamoTables() throws IOException {
        String env = "test";

        System.setProperty("dumpToTmp", "false");

        BiFunction<String, String, String> baseCommandGen = (String account, String amb) -> {
            String profile = "sso_pn-" + account + "-" + amb;
            String awsAccountId = this.getAwsAccountId( profile );

            return "dynamoExportsIndexing "
                    + " --aws-profile " + profile + " "
                    + " --aws-bucket pn-datamonitoring-eu-south-1-" + awsAccountId + " "
                    + " --aws-dynexport-folder-prefix %s/incremental2024/ "
                    //+ "--result-upload-url s3://dynamo-export-dailytest/parquet/ "
                    ;
        };
        String indexConfinfoDynamo = baseCommandGen.apply( "confinfo", env);
        String indexCoreDynamo = baseCommandGen.apply( "core", env);


        String commandLine = " --dynexp-indexed-data-folder ./out/prove_dev/dynExp "
                + indexConfinfoDynamo + " pn-EcRichiesteMetadati 2024-1-1 2025-1-1 "
                + indexConfinfoDynamo + " pn-SsDocumenti 2024-1-1 2025-1-1 "
                + indexCoreDynamo + " pn-PaperRequestError 2024-1-1 2025-1-1 "
                ;

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }


    //@Test TO BE FIXED
    public void exportTimelineForInvoicingWithFix() throws IOException {
        String indexCdcCore = "cdcIndexing --aws-profile sso_pn-core-prod --aws-bucket pn-logs-bucket-eu-south-1-510769970275-001 ";

        String repeatSubcommand = " --cdc-indexed-data-folder ./out/prove/cdc " +
                "jsonTransform --aws-profile sso_pn-confinfo-prod + fixGeoKey " +
                indexCdcCore + " pn-TimelinesForInvoicing 2023-6-1 2024-1-9 " ;

        int exitCode = CommandsMain.doMain( repeatSubcommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }


    // @Test TO BE EXTENDED FOR GENERIC SCRIPT RUNNING
    public void exportEcMetadata() throws IOException {
        String commandLine = " exportEcRichiesteMetadati";

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }

    private String getAwsAccountId(String profileName) {
        StsClientBuilder builder = StsClient.builder();

        if( StringUtils.isNotBlank( profileName )) {
            builder.credentialsProvider( ProfileCredentialsProvider.create( profileName ));
        }

        StsClient sts = builder.build();

        return sts.getCallerIdentity().account();
    }

}
