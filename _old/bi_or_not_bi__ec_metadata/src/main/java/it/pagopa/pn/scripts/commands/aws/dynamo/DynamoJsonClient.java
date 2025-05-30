package it.pagopa.pn.scripts.commands.aws.dynamo;

import org.codehaus.jettison.json.JSONArray;
import org.codehaus.jettison.json.JSONException;
import org.codehaus.jettison.json.JSONObject;
import org.jetbrains.annotations.Nullable;
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.DynamoDbClientBuilder;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.utils.StringUtils;

import java.util.HashMap;
import java.util.Map;

public class DynamoJsonClient {

    private final String profileName;
    private final String regionCode;

    private final DynamoDbClient dynamoClient;

    public DynamoJsonClient(String profileName, String regionCode) {
        this.profileName = profileName;
        this.regionCode = regionCode;

        this.dynamoClient = createClient( profileName, regionCode );
    }

    public JSONObject getByKey( String tableName, String pkValue, String skValue ) {

        TableMetadata metadata = TableMetadataMap.TABLE_METADATA_MAP.get( tableName );
        if( metadata == null ) {
            throw new IllegalArgumentException("Table not supported: " + tableName );
        }

        Map<String, AttributeValue> keyAttributes = new HashMap<>();
        keyAttributes.put( metadata.pk(), AttributeValue.fromS( pkValue ));
        if( metadata.sk() != null ) {
            keyAttributes.put( metadata.sk(), AttributeValue.fromS( skValue ));
        }

        GetItemRequest request = GetItemRequest.builder()
                .tableName( tableName )
                .key( keyAttributes )
                .build();
        GetItemResponse response = dynamoClient.getItem( request );

        JSONObject result = dynamoItemToJsonObject(response);
        return result;
    }

    @Nullable
    private JSONObject dynamoItemToJsonObject( GetItemResponse response) {
        try {

            JSONObject result;
            if( response.hasItem() ) {
                result = dynamoItemToJson( response.item() );
            }
            else {
                result = null;
            }
            return result;

        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
    }

    private DynamoDbClient createClient(String profileName, String regionCode ) {
        DynamoDbClientBuilder builder = DynamoDbClient.builder();

        if( StringUtils.isNotBlank( profileName )) {
            builder.credentialsProvider( ProfileCredentialsProvider.create( profileName ));
        }

        if( StringUtils.isNotBlank( regionCode )) {
            builder.region( Region.of( regionCode ));
        }

        return builder.build();
    }

    private JSONObject dynamoItemToJson(Map<String, AttributeValue> item) throws JSONException {
        JSONObject result = new JSONObject();

        for( Map.Entry<String, AttributeValue> entry: item.entrySet()) {
            result.put( entry.getKey(), dynamoItemToJson( entry.getValue() ));
        }
        return result;
    }

    private JSONObject dynamoItemToJson( AttributeValue val) throws JSONException {
        AttributeValue.Type attrType = val.type();

        JSONObject result;
        switch ( attrType ) {
            case B, BS, NS, SS, UNKNOWN_TO_SDK_VERSION -> {
                throw new UnsupportedOperationException("Type " + attrType + " decodicng not supported" );
            }
            case L -> {
                result = new JSONObject();

                JSONArray array = new JSONArray( );
                result.put("L", array);

                for( AttributeValue arrayEl: val.l() ) {
                    array.put( dynamoItemToJson( arrayEl ));
                }
            }
            case M -> {
                result = new JSONObject();
                result.put("M", dynamoItemToJson( val.m() ));
            }
            case N -> {
                result = new JSONObject();
                result.put("N", val.n());
            }
            case S -> {
                result = new JSONObject();
                result.put("S", val.s());
            }
            case BOOL -> {
                result = new JSONObject();
                result.put("BOOL", val.bool());
            }
            case NUL -> {
                result = new JSONObject();
                result.put("NUL", val.nul());
            }
            default -> {
                throw new UnsupportedOperationException("Type " + attrType + " decodicng not supported" );
            }
        }
        return result;
    }

}
