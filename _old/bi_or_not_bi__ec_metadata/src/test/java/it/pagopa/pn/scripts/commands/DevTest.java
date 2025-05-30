package it.pagopa.pn.scripts.commands;

import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import org.testng.Assert;
import org.testng.annotations.Test;

import java.io.IOException;

public class DevTest {

    @Test
    public void exportNotificationWithFix() throws IOException {

        String indexCdcCore = "cdcIndexing --aws-profile sso_pn-core-dev " +
                "--aws-bucket pn-logs-bucket-eu-south-1-830192246553-001 " +
                "--result-upload-url s3://dynamo-exports-830192246553-eu-south-1/parquet/ ";

        String fullCommand = " --cdc-indexed-data-folder ./out/prove_dev/cdc " +
                indexCdcCore + " pn-Notifications 2023-06-1 2023-12-1 " +
                "jsonTransform --aws-profile sso_pn-core-dev + fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2023-12-1 2024-1-5 " +
                "jsonTransform - fixSourceChannelDetails " +
                indexCdcCore + " pn-Notifications 2024-1-5 2025-1-1 ";

        int exitCode = CommandsMain.doMain( fullCommand.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }


    @Test
    public void exportEcMetadata() throws IOException {

        String indexEcMetadata = "" +
                "dynamoExportsIndexing " +
                "--aws-profile sso_pn-confinfo-hotfix-rw " +
                "--aws-bucket dynamo-export-dailytest " +
                "--aws-full-export-date 2024-1-14 " +
                "--aws-dynexport-folder-prefix %s/incremental2024/ " +
                "--result-upload-url s3://dynamo-export-dailytest/parquet/ " +
                "pn-EcRichiesteMetadati";

        String commandLine = " --dynexp-indexed-data-folder ./out/prove_dev/dynExp " +
                indexEcMetadata + " 2024-1-1 2025-1-1 " ;

        int exitCode = CommandsMain.doMain( commandLine.trim().split(" +"));

        Assert.assertEquals( exitCode, 0 );
    }


    @Test
    void pippo() {
        DateHoursStream.stream(
                DateHoursStream.DateHour.valueOf( 2024,02, 07),
                DateHoursStream.DateHour.valueOf( 3024,02, 07),
                DateHoursStream.TimeUnitStep.DAY,
                true
            )
                .forEach( h -> System.out.println( h.toString("-") ));
    }

}
