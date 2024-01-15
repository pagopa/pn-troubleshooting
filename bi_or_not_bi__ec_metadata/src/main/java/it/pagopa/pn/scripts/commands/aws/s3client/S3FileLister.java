package it.pagopa.pn.scripts.commands.aws.s3client;

import it.pagopa.pn.scripts.commands.logs.Msg;
import it.pagopa.pn.scripts.commands.logs.MsgSenderSupport;
import org.jetbrains.annotations.NotNull;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3ClientBuilder;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.paginators.ListObjectsV2Iterable;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;
import software.amazon.awssdk.services.s3.presigner.model.PresignedGetObjectRequest;
import software.amazon.awssdk.utils.StringUtils;

import java.io.*;
import java.time.Duration;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import java.util.zip.GZIPInputStream;

public class S3FileLister extends MsgSenderSupport {

    private String profileName;
    private String regionCode;

    private S3Client s3;
    private S3Presigner presigner;

    private MsgSenderSupport listenersSupport = new MsgSenderSupport();

    public S3FileLister( String profileName, String regionCode) {
        this.profileName = profileName;
        this.regionCode = regionCode;

        this.s3 = createClient( profileName, regionCode);
        this.presigner = createPresigner( profileName, regionCode);
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
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket( bucket )
                .key(s3ObjKey)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration( Duration.ofMinutes(10) )
                .getObjectRequest( getObjectRequest )
                .build();

        PresignedGetObjectRequest presignedRequest = presigner.presignGetObject( presignRequest );

        try{
            fireMessage(Msg.readFileStart(s3ObjKey));

            InputStream is = new BufferedInputStream( presignedRequest.url().openStream() );
            if ( s3ObjKey.endsWith(".gz") ) {
                is = new GZIPInputStream( is );
            }
            BufferedReader reader = new BufferedReader(new InputStreamReader(is));

            Stream<String> lineStream = reader.lines();
            freeResourcesOnStreamClose(reader, lineStream);

            return lineStream;
        } catch (IOException exc) {
            throw new RuntimeException( exc );
        }
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
        String s3ObjKey = s3Obj.key();
        GetObjectRequest getObjectRequest = GetObjectRequest.builder()
                .bucket( bucket )
                .key(s3ObjKey)
                .build();

        GetObjectPresignRequest presignRequest = GetObjectPresignRequest.builder()
                .signatureDuration( Duration.ofMinutes(10) )
                .getObjectRequest( getObjectRequest )
                .build();

        PresignedGetObjectRequest presignedRequest = presigner.presignGetObject( presignRequest );

        try(BufferedReader br = new BufferedReader(new InputStreamReader(
                                    buildUnzippedS3ObjInputStream(s3ObjKey, presignedRequest)))) {

            fireMessage(Msg.readFileStart(s3ObjKey));

            return br.lines().collect(Collectors.joining("\n"));

        } catch (IOException exc) {
            throw new RuntimeException( exc );
        }
    }

    @NotNull
    private static InputStream buildUnzippedS3ObjInputStream(String s3ObjKey, PresignedGetObjectRequest presignedRequest) throws IOException {
        InputStream is = new BufferedInputStream( presignedRequest.url().openStream() );
        if ( s3ObjKey.endsWith("\\.gz") ) {
            is = new GZIPInputStream( is );
        }
        return is;
    }
}
