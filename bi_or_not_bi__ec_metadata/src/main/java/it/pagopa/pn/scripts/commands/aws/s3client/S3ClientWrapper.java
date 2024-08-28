package it.pagopa.pn.scripts.commands.aws.s3client;

import it.pagopa.pn.scripts.commands.logs.Msg;
import it.pagopa.pn.scripts.commands.logs.MsgSenderSupport;
import org.apache.commons.io.IOUtils;
import org.jetbrains.annotations.NotNull;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3AsyncClient;
import software.amazon.awssdk.services.s3.S3AsyncClientBuilder;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.paginators.ListObjectsV2Iterable;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.transfer.s3.S3TransferManager;
import software.amazon.awssdk.transfer.s3.model.CompletedDirectoryUpload;
import software.amazon.awssdk.transfer.s3.model.DirectoryUpload;
import software.amazon.awssdk.transfer.s3.model.UploadDirectoryRequest;
import software.amazon.awssdk.utils.StringUtils;

import java.io.*;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Objects;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.GZIPInputStream;

public class S3ClientWrapper extends MsgSenderSupport {

    private boolean dumpToTmp;

    private String profileName;
    private String regionCode;

    private S3Client s3;

    private S3AsyncClient asyncS3;

    private S3Presigner presigner;

    private S3TransferManager transferManager;

    private MsgSenderSupport listenersSupport = new MsgSenderSupport();

    public S3ClientWrapper(String profileName, String regionCode) {
        this.profileName = profileName;
        this.regionCode = regionCode;

        this.s3 = createClient( profileName, regionCode );
        this.asyncS3 = createAsyncClient( profileName, regionCode );
        this.presigner = createPresigner( profileName, regionCode );
        this.transferManager = createTransferManager( this.asyncS3 );

        this.dumpToTmp = "true".equalsIgnoreCase( System.getProperty("dumpToTmp"));
    }

    private S3Client createClient(  String profileName, String regionCode ) {
        S3ClientBuilder builder = S3Client.builder();

        if( StringUtils.isNotBlank( profileName )) {
            builder.credentialsProvider( ProfileCredentialsProvider.create( profileName ));
        }

        if( StringUtils.isNotBlank( regionCode )) {
            builder.region( Region.of( regionCode ));
        }

        return builder.build();
    }

    private S3AsyncClient createAsyncClient(String profileName, String regionCode ) {
        S3AsyncClientBuilder builder = S3AsyncClient.builder();

        if( StringUtils.isNotBlank( profileName )) {
            builder.credentialsProvider( ProfileCredentialsProvider.create( profileName ));
        }

        if( StringUtils.isNotBlank( regionCode )) {
            builder.region( Region.of( regionCode ));
        }

        return builder.build();
    }

    private S3Presigner createPresigner(  String profileName, String regionCode ) {
        S3Presigner.Builder builder = S3Presigner.builder();

        if( StringUtils.isNotBlank( profileName )) {
            builder.credentialsProvider( ProfileCredentialsProvider.create( profileName ));
        }

        if( StringUtils.isNotBlank( regionCode )) {
            builder.region( Region.of( regionCode ));
        }

        return builder.build();
    }

    private S3TransferManager createTransferManager( S3AsyncClient asyncS3 ) {
        return S3TransferManager.builder()
                .s3Client( asyncS3 )
                .build();
    }


    public Stream<S3Object> listObjectsWithPrefix(String bucket, String prefix ) {

        ListObjectsV2Request listRequest = ListObjectsV2Request.builder()
                .bucket( bucket )
                .prefix( prefix )
                .build();

        ListObjectsV2Iterable responses = s3.listObjectsV2Paginator( listRequest );
        return responses.stream().flatMap( page -> page.contents().stream() )
                .map( el -> {
                    fireMessage(Msg.fileListed( el.key() ));
                    return el;
                });
    }

    public Stream<S3Object> listObjectsWithPrefixAndRegExp(String bucket, String prefix, String regExp ) {

        Predicate<String> keyPredicate = Pattern.compile( regExp ).asMatchPredicate();
        Predicate<S3Object> s3ObjPredicate = (s3Obj) -> keyPredicate.test( s3Obj.key() );

        return listObjectsWithPrefix( bucket, prefix ).filter( s3ObjPredicate );
    }

    public Stream<S3Object> listObjectsWithPrefix( String s3Url ) {
        BucketAndPath s3Coordinate = BucketAndPath.parseFromUrl( s3Url );

        return listObjectsWithPrefix( s3Coordinate.bucketName(), s3Coordinate.path() );
    }

    @NotNull
    public Stream<String> listObjectsWithPrefixAndRegExpContent(
            String bucket,
            String prefix,
            String regExp
    ) {

        Stream<String> lines = listObjectsWithPrefixAndRegExp( bucket, prefix, regExp )
                .flatMap( s3Obj -> getObjectContent( bucket, s3Obj) );

        return lines;
    }

    public Stream<String> getObjectContent( String bucket, S3Object s3Obj ) {
        String s3ObjKey = s3Obj.key();
        PresignedGetObjectRequest presignedRequest = getPresignedRequest(bucket, s3ObjKey, 10);

        try{
            fireMessage(Msg.readFileStart(s3ObjKey));

            InputStream is = new BufferedInputStream( buildUnzippedS3ObjInputStream(s3ObjKey, presignedRequest) );

            BufferedReader reader = new BufferedReader(new InputStreamReader(is));

            Stream<String> lineStream = reader.lines();
            freeResourcesOnStreamClose(reader, lineStream);

            return lineStream;
        } catch (IOException exc) {
            throw new RuntimeException( exc );
        }
    }

    public String getObjectContetAsString(String bucket, String s3ObjKey) {
        PresignedGetObjectRequest presignedRequest = getPresignedRequest(bucket, s3ObjKey, 120);

        try(BufferedReader br = new BufferedReader(new InputStreamReader(
                buildUnzippedS3ObjInputStream(s3ObjKey, presignedRequest)))) {

            fireMessage(Msg.readFileStart(s3ObjKey));

            return br.lines().collect(Collectors.joining("\n"));

        } catch (IOException exc) {
            throw new RuntimeException( exc );
        }
    }

    private PresignedGetObjectRequest getPresignedRequest(String bucket, String s3ObjKey, int minutes) {
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket(bucket)
                .key(s3ObjKey)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(minutes))
                .getObjectRequest(getObjectRequest)
                .build();

        PresignedGetObjectRequest presignedRequest = presigner.presignGetObject(presignRequest);
        return presignedRequest;
    }

    private static void freeResourcesOnStreamClose(BufferedReader reader, Stream<String> lineStream) {
        lineStream.onClose( () -> {
            try {
                reader.close();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        });
    }


    public String getObjectContetAsString(String bucket, S3Object s3Obj) {
        return getObjectContetAsString( bucket, s3Obj.key() );
    }

    @NotNull
    private InputStream buildUnzippedS3ObjInputStream(String s3ObjKey, PresignedGetObjectRequest presignedRequest) throws IOException {
        InputStream is = new BufferedInputStream( presignedRequest.url().openStream() );
        if ( s3ObjKey.endsWith(".gz") ) {
            is = new GZIPInputStream( is );
        }

        if( dumpToTmp ) {
            Path tmpFile = Files.createTempFile( "s3clientWrapper_", "_fromS3" );
            try ( FileOutputStream tmpOut = new FileOutputStream( tmpFile.toFile() ) ) {
                IOUtils.copy( is, tmpOut );
                is.close();
                is = new FileInputStream( tmpFile.toFile() );
            }
        }

        return is;
    }

    public void upload( Path sourcePath, String destinationS3Url ) {
        fireMessage( Msg.fileUploadStart( destinationS3Url ));

        BucketAndPath s3Coordinate = BucketAndPath.parseFromUrl( destinationS3Url );

        DirectoryUpload directoryUpload = transferManager
                .uploadDirectory(
                        UploadDirectoryRequest.builder()
                                .source( sourcePath )
                                .bucket( s3Coordinate.bucketName() )
                                .s3Prefix( s3Coordinate.path() )
                                .build()
                );

        CompletedDirectoryUpload completedDirectoryUpload = directoryUpload
                .completionFuture().join();

        if( ! completedDirectoryUpload.failedTransfers().isEmpty() ) {
            String message = completedDirectoryUpload.failedTransfers().stream()
                    .map( e -> e.toString() )
                    .collect(Collectors.joining("\n"));
            throw new RuntimeException( message );
        }

        fireMessage( Msg.fileUploadEnd( destinationS3Url ));
    }

    public void copy( String bucketName, String from, String to) {
        if( ! Objects.equals( from, to) ) {

            CopyObjectRequest build = CopyObjectRequest.builder()
                    .sourceBucket( bucketName )
                    .sourceKey( from )
                    .destinationBucket( bucketName )
                    .destinationKey( to )
                    .build();

            this.s3.copyObject(build).copyObjectResult();
        }
    }

    public void delete( String bucketName, String key ) {
        DeleteObjectRequest request = DeleteObjectRequest.builder()
                .bucket( bucketName )
                .key( key )
                .build();

        this.s3.deleteObject( request );
    }



    public record BucketAndPath(String bucketName, String path ) {
        public static BucketAndPath parseFromUrl(String s3Url) {
            URI uri = URI.create(s3Url);
            String bucket = uri.getHost();
            String path = uri.getPath();
            if( path.startsWith("/") ) {
                path = path.substring(1);
            }

            BucketAndPath s3Coordinate = new BucketAndPath( bucket, path );
            return s3Coordinate;
        }
    };

}
