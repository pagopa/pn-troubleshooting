#!/bin/sh

_BASEURI="http://localhost:8080"
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
"safestorage://PN_NOTIFICATION_ATTACHMENTS-610f5131a31a4877a4548aff9742bd18.pdf"
"safestorage://PN_NOTIFICATION_ATTACHMENTS-ea8c81c579a743c8aa32212b3b53a186.pdf"
"safestorage://PN_NOTIFICATION_ATTACHMENTS-1a403af24d8e4fb78010bf714d7ed323.pdf"
"safestorage://PN_NOTIFICATION_ATTACHMENTS-10f0dcc2885048f7843b61deacb83f91.pdf"
"safestorage://PN_NOTIFICATION_ATTACHMENTS-5b0175d8400d443c946a2c38b885bbaa.pdf"
"safestorage://PN_NOTIFICATION_ATTACHMENTS-35d0da7b87bd413089cc3b17c5b3a98c.pdf"
"safestorage://PN_NOTIFICATION_ATTACHMENTS-84a616741eec45f58e1ce65276360f60.pdf"
# "8U"
# "9U"
# "10U"
#"safestorage://PN_NOTIFICATION_ATTACHMENTS-3825bc5e9f5a41689c0e03819e97209d.pdf"
)
NA_SHA256=(
"Eco2JIh/PcJGUqxpQl5qQ53y/7m9bBGUOjDeOAmKK9w="
"2wuoWmKxEb1gatQVUBWC2GJqIK56Xj9A2wPHYSYhKR4="
"fcgCEKjXn+6BpA5t0QhypGgkL+mOyVNUP6y2mUOKACY="
"+vlYXCMsWBdg7uTOhDoa28FMcYeG6qEBwbPoif7s8Ug="
"Zsk+7Mqu0JJCKh7EPN5PVQ8yzPRhVmJhkVOEQZUZAu4="
"fu4mNbwqLXIcZX6RPtOtXkQlecUCEkuv6tYSkmFcGR0="
"l+lopNCL4Qpl3Os/0TuTC3Xmyh38bhZT3Uiv1+jvppk="
# "9S"
# "10S"
#"C5g4VkbBZtdUGmTTGZwaBO0rUUwb2QUNigXzD22E5LE="
)

# array for addresses
ADDRESS=(
"ADDRESS"
# "1A"
# "2A"
# "3A"
# "4A"
# "5A"
# "6A"
# "7A"
# "8A"
# "9A"
# "10A"
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


#execute_call "AR" "64010" "ANCARANO" "TE" "ITALIA" 3
#execute_call "AR" "64010" "ANCARANO" "TE" "ITALIA" 1

execute_call "AR" "00122" "ROMA" "RM" "ITALIA" 7