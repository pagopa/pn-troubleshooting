package it.pagopa.pn.scripts.commands.indexing;

import it.pagopa.pn.scripts.commands.aws.s3client.S3ClientWrapper;
import it.pagopa.pn.scripts.commands.utils.DateHoursStream;
import org.apache.commons.lang3.StringUtils;

import java.nio.file.Path;

public abstract class AbstractUploadSupport {

    protected abstract String getBaseUploadUrl();

    protected abstract Path getBaseOutputFolder();

    protected boolean isMissingFromUploadDestination( Path outputPath, S3ClientWrapper s3 ) {

        boolean result;
        if( StringUtils.isNotBlank( getBaseUploadUrl() )) {
            String destinationS3Url = computes3Url(outputPath);
            if( ! destinationS3Url.endsWith("/") ) {
                destinationS3Url += "/";
            }

            boolean isPresent = s3.listObjectsWithPrefix( destinationS3Url )
                    .findAny().isPresent();
            result = ! isPresent;
        }
        else {
            result = true;
        }
        return result;
    }

    protected JobWithOutput wrapWithUpload(JobWithOutput job, S3ClientWrapper s3) {
        return new JobWithOutput() {
            @Override
            public Path outputFolder() {
                return job.outputFolder();
            }

            @Override
            public void run() {
                job.run();

                Path outputPath = job.outputFolder();
                if( StringUtils.isNotBlank( getBaseUploadUrl() ) ) {

                    String destinationS3Url = computes3Url(outputPath);
                    s3.upload(outputPath, destinationS3Url );
                }
            }
        };
    }

    private String computes3Url(Path outputPath) {
        String destinationS3Url = getBaseUploadUrl().trim();
        if( ! destinationS3Url.endsWith("/") ) {
            destinationS3Url += "/";
        }
        destinationS3Url += getBaseOutputFolder().relativize(outputPath);
        return destinationS3Url;
    }
}
