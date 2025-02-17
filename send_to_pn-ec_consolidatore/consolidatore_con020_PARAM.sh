#!/bin/sh

_BASEURI="http://localhost:8889"
TESTCASE=$1
IUN=IUN_CONS-`date +"%Y%m%d-%H%M"`-F-1

# incrementato a ogni chiamata
I=0

# incrementato nel ciclo ma non resettato a ogni chiamata
MIXED_INDEX=0

# PA ID
PAID="00207190257"

# array for AAR URI and SHA256
AAR_URI=(
"safestorage://PN_AAR-723e76dd8a98476091369ba1b07f1a81.pdf"
)
AAR_SHA256=(
"XwRVE/PUU1TEi9r3Pmq2KEkmQ2yr7ge8jUDQKPL0e/Y="
)

# array per Notification attachment URI and SHA256
NA_URI=(
"1U"
"2U"
"3U"
"4U"
"5U"
"6U"
"7U"
"8U"
"9U"
"10U"
#"safestorage://PN_NOTIFICATION_ATTACHMENTS-3825bc5e9f5a41689c0e03819e97209d.pdf"
)
NA_SHA256=(
"1S"
"2S"
"3S"
"4S"
"5S"
"6S"
"7S"
"8S"
"9S"
"10S"
#"C5g4VkbBZtdUGmTTGZwaBO0rUUwb2QUNigXzD22E5LE="
)

# array for addresses
ADDRESS=(
"1A"
"2A"
"3A"
"4A"
"5A"
"6A"
"7A"
"8A"
"9A"
"10A"
)




function execute_call {
    # incrementato a ogni chiamata
    ((I=I+1))

    # resettato a ogni chiamata e incrementato nel ciclo
    R=0

    while [ $R -lt $6 ]
    do
        RQID="PNMAN.${IUN}.TESTCASE_$I.PCRETRY_$R"
        echo "$RQID" >> $FILENAME
        echo "$RQID"


        # se usiamo R per ciclare, riparte da 0 ad ogni chiamata
        #INDEX_AAR=$(( R % ${#AAR_URI[@]} )) # aar: used for uri and sha256
        #INDEX_NA=$(( R % ${#NA_URI[@]} )) # notification attachment: used for uri and sha256
        #INDEX_ADDRESS=$(( R % ${#ADDRESS[@]} )) # used for address (so we can have 5 uris and 1 address, and so on)

        # voglio che l'indice R continui a incrementare anche tra chiamate, usando MIXED_INDEX
        INDEX_AAR=$(( MIXED_INDEX % ${#AAR_URI[@]} )) # aar: used for uri and sha256
        INDEX_NA=$(( MIXED_INDEX % ${#NA_URI[@]} )) # notification attachment: used for uri and sha256
        INDEX_ADDRESS=$(( MIXED_INDEX % ${#ADDRESS[@]} )) # used for address (so we can have 5 uris and 1 address, and so on)


        curl --location --request PUT "$_BASEURI/external-channels/v1/paper-deliveries-engagements/$RQID" \
        --header "x-pagopa-extch-cx-id: pn-cons-000" \
        --header 'Content-Type: application/json' \
        --data "{
            \"iun\": null,
            \"requestId\": \"$RQID\",
            \"requestPaId\": \"$PAID\",
            \"clientRequestTimeStamp\": \"2023-05-12T09:16:13.021Z\",
            \"productType\": \"$1\",
            \"attachments\": [
                {
                    \"uri\": \"${AAR_URI[$INDEX_AAR]}\",
                    \"order\": 0,
                    \"documentType\": \"AAR\",
                    \"sha256\": \"${AAR_SHA256[$INDEX_AAR]}\"
                },
                {
                     \"uri\": \"${NA_URI[$INDEX_NA]}\",
                     \"order\": 1,
                     \"documentType\": \"ATTO\",
                     \"sha256\": \"${NA_SHA256[$INDEX_NA]}\"
                }
            ],
            \"printType\": \"BN_FRONTE_RETRO\",
            \"receiverName\": \"Leonardo Martini\",
            \"receiverNameRow2\": null,
            \"receiverAddress\": \"VIA_PN_2_CONS ${ADDRESS[$INDEX_ADDRESS]}\",
            \"receiverAddressRow2\": null,
            \"receiverCap\": \"$2\",
            \"receiverCity\": \"$3\",
            \"receiverCity2\": null,
            \"receiverPr\": \"$4\",
            \"receiverCountry\": \"$5\",
            \"receiverFiscalCode\": \"MRTLSN74T13H294C\",
            \"senderName\": \"PagoPA S.p.A.\",
            \"senderAddress\": \"Via Sardegna n. 38\",
            \"senderCity\": \"Roma\",
            \"senderPr\": \"Roma\",
            \"senderDigitalAddress\": null,
            \"arName\": \"PagoPA S.p.A.\",
            \"arAddress\": \"Via Sardegna n. 38\",
            \"arCap\": \"00187\",
            \"arCity\": \"Roma\",
            \"vas\": null
        }"
        R=$(( $R + 1 ))

        # incremento MIXED_INDEX
        ((MIXED_INDEX=MIXED_INDEX+1))
    done

}

echo "START test $IUN"
FILENAME="test_$IUN.txt"
echo "CONSOLIDATORE $IUN" > $FILENAME


execute_call "AR" "64010" "ANCARANO" "TE" "ITALIA" 3
execute_call "AR" "64010" "ANCARANO" "TE" "ITALIA" 1