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
"safestorage://PN_NOTIFICATION_ATTACHMENTS-9e41619235e248b89d9928a2daf1d641.pdf" #1
"safestorage://PN_NOTIFICATION_ATTACHMENTS-1bcd534b33d14a27bf2736c85621be93.pdf" #2
"safestorage://PN_NOTIFICATION_ATTACHMENTS-f3961c7ba3954314805967909eab3231.pdf" #3
"safestorage://PN_NOTIFICATION_ATTACHMENTS-f84346e8de4c44078376ec1ab348b010.pdf" #4
"safestorage://PN_NOTIFICATION_ATTACHMENTS-6b06c3a6d5ac4b03a9631f904fd33bf3.pdf" #5
"safestorage://PN_NOTIFICATION_ATTACHMENTS-d1d836c5d18147319a7f2677a2071be1.pdf" #6
"safestorage://PN_NOTIFICATION_ATTACHMENTS-23ae5ee15fc4962833d46c6abf28093.pdf"  #7 
"safestorage://PN_NOTIFICATION_ATTACHMENTS-a4e54dafbe854ab8afdeb916d008a8f9.pdf" #8
"safestorage://PN_NOTIFICATION_ATTACHMENTS-df8df7a7b8134530a9110f243eda69b5.pdf" #9
"safestorage://PN_NOTIFICATION_ATTACHMENTS-ee62b47dee4c90ae5c84455cb08c6a.pdf"   #10
)
NA_SHA256=(
"b50BuvomQv/KsKEVSbX7207zf66vj0Xyz8EAddc2o4s=" #1
"TeRjy5OB1lQi5nh3qOZ2UbRpra5CVjL16hN4yvqIbu4=" #2
"2JrXhZTxuO2rYC6rvlEaZWuFNMmRGSKpr9zFPk8g7hY=" #3
"BJ/K+MxOsxXtfnx/0Rw4jYnULCryHtPIJ92Y9rUOWEM=" #4
"eQfCJM0eWDVuBNG82TgrNNg+TlbBt1yTkdeaD4FPl0Q=" #5
"64jgM98dlOQIvGIfXw6VYa6y3PQNnhQCUMv3T0JPVN4=" #6
"C5g4VkbBZtdUGmTTGZwaBO0rUUwb2QUNigXzD22E5LE=" #7
"hQj64hXVHBz90OEqIk8XMs6YmaTGgziyUFJWT2Dv6dw=" #8
"NAQfSE5f1EPK7clJ8oz4qOVBS38P3EjCi1sWrIGBuH8=" #9
"Zu2TwRIRTDoiO+jQuODAF/KsDy2pJ9oNLdlrFkHvsd4=" #10
)

# array for addresses
ADDRESS=(
"VIA P"
"PIAZZA A"
"VICOLO N"
"VIA CONS"
"LARGO T"
"VICOLO N"
"VIA CONS"
"LARGO T"
"PIAZZA A"
"VIA P"
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


        # se usiamo R per ciclare, l'indice riparte da 0 ad ogni chiamata
        #INDEX_AAR=$(( R % ${#AAR_URI[@]} )) # aar: used for uri and sha256
        #INDEX_NA=$(( R % ${#NA_URI[@]} )) # notification attachment: used for uri and sha256
        #INDEX_ADDRESS=$(( R % ${#ADDRESS[@]} )) # used for address (so we can have 5 uris and 1 address, and so on)

        # se usiamo MIXED_INDEX, l'indice continua a incrementare anche tra chiamate, non venendo azzerato
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

#execute_call "AR" "00122" "ROMA" "RM" "ITALIA" 7

#     # ANCONA
# execute_call "AR" "60122" "ANCONA" "AN" "ITALIA" 2
# execute_call "AR" "60022" "CASTELFIDARDO" "AN" "ITALIA" 1
# execute_call "AR" "60122" "ANCONA" "AN" "ITALIA" 1
# execute_call "AR" "60123" "ANCONA" "AN" "ITALIA" 3
# execute_call "AR" "60022" "CASTELFIDARDO" "AN" "ITALIA" 1
# execute_call "AR" "60122" "ANCONA" "AN" "ITALIA" 2

#     # TORINO
# execute_call "AR" "10122" "TORINO" "TO" "ITALIA" 2
# execute_call "AR" "10022" "CARMAGNOLA" "TO" "ITALIA" 1
# execute_call "AR" "10122" "TORINO" "TO" "ITALIA" 1
# execute_call "AR" "10123" "TORINO" "TO" "ITALIA" 3
# execute_call "AR" "10022" "CARMAGNOLA" "TO" "ITALIA" 1
# execute_call "AR" "10122" "TORINO" "TO" "ITALIA" 2

#     # NAPOLI
# execute_call "AR" "80122" "NAPOLI" "NA" "ITALIA" 2
# execute_call "AR" "80022" "ARZANO" "NA" "ITALIA" 1
# execute_call "AR" "80122" "NAPOLI" "NA" "ITALIA" 1
# execute_call "AR" "80123" "NAPOLI" "NA" "ITALIA" 3
# execute_call "AR" "80022" "ARZANO" "NA" "ITALIA" 1
# execute_call "AR" "80122" "NAPOLI" "NA" "ITALIA" 2

#     # ROMA
# execute_call "AR" "00122" "ROMA" "RM" "ITALIA" 2
# execute_call "AR" "00022" "ANTICOLI CORRADO" "RM" "ITALIA" 1
# execute_call "AR" "00122" "ROMA" "RM" "ITALIA" 1
# execute_call "AR" "00123" "ROMA" "RM" "ITALIA" 3
# execute_call "AR" "00022" "ANTICOLI CORRADO" "RM" "ITALIA" 1
# execute_call "AR" "00122" "ROMA" "RM" "ITALIA" 2

    # VENEZIA
execute_call "AR" "30122" "VENEZIA" "VE" "ITALIA" 2
execute_call "AR" "30022" "CEGGIA" "VE" "ITALIA" 1
execute_call "AR" "30122" "VENEZIA" "VE" "ITALIA" 1
execute_call "AR" "30123" "VENEZIA" "VE" "ITALIA" 3
execute_call "AR" "30022" "CEGGIA" "VE" "ITALIA" 1
execute_call "AR" "30122" "VENEZIA" "VE" "ITALIA" 2
