#!/bin/sh

_BASEURI="http://localhost:8889"
TESTCASE=$1
IUN=IUN_CONS-`date +"%Y%m%d-%H%M"`-F-1
I=0
#PN_NOTIFICATION_ATTACHMENTS-a12020246e0843538f380870cd83b3f3.pdf - 23/3
#PN_NOTIFICATION_ATTACHMENTS-a002cd0d4a1f4fdaaa7ef46ba7507677.pdf - 12/3

# Campania, tassa automobilistica (grandi dimensioni):
#{
#                    \"uri\": \"safestorage://PN_NOTIFICATION_ATTACHMENTS-8c0b7e80907844e7b3a0c5d3c955c99d.pdf\",
#                    \"order\": 1,
#                    \"documentType\": \"ATTO\",
#                    \"sha256\": \"V8et70pSHZNQ+UtTnK6NiYEDHjLKbD53SSG+h/zxr4s=\"
#                }

# documento 50 Mb, scartato per formattazione errata:
#{
#                    \"uri\": \"safestorage://PN_NOTIFICATION_ATTACHMENTS-446458e3d274026945914ab3eb9cddd.pdf\",
#                    \"order\": 1,
#                    \"documentType\": \"ATTO\",
#                    \"sha256\": \"VHAzOddGp0Bc5tsvKS/gI4ukX4u5/M0POC6XKUjFTUM=\"
#                }


# documento non valido: PN_NOTIFICATION_ATTACHMENTS-c45ab0619c0644d492d1580e4e0933d1.pdf
#{
#                    \"uri\": \"safestorage://PN_NOTIFICATION_ATTACHMENTS-c45ab0619c0644d492d1580e4e0933d1.pdf\",
#                    \"order\": 1,
#                    \"documentType\": \"ATTO\",
#                    \"sha256\": \"KXFphWUHm2jC6iblna2tGgLg4FfpXuSku/0/uHLBQ8U=\"
#                }


# normale:
                # {
                #     \"uri\": \"safestorage://PN_NOTIFICATION_ATTACHMENTS-1000029d58154e5192e176a31b7f22d2.pdf\",
                #     \"order\": 1,
                #     \"documentType\": \"ATTO\",
                #     \"sha256\": \"MN14AU6XWWCgGiRI0mENrK8LrKdi8FhkXB1fhRtoff8=\"
                # }


function execute_call {
    ((I=I+1))
    R=0
    while [ $R -lt $6 ]
    do
        RQID="PNMAN.${IUN}.TESTCASE_$I.PCRETRY_$R"
        echo "$RQID" >> $FILENAME
        echo "$RQID"
        curl --location --request PUT "$_BASEURI/external-channels/v1/paper-deliveries-engagements/$RQID" \
        --header "x-pagopa-extch-cx-id: pn-cons-000" \
        --header 'Content-Type: application/json' \
        --data "{
            \"iun\": null,
            \"requestId\": \"$RQID\",
            \"requestPaId\": \"00207190257\",
            \"clientRequestTimeStamp\": \"2023-05-12T09:16:13.021Z\",
            \"productType\": \"$1\",
            \"attachments\": [
                {
                    \"uri\": \"safestorage://PN_AAR-10000d9a5fd3495f8eabd5cf7ebc74da.pdf\",
                    \"order\": 0,
                    \"documentType\": \"AAR\",
                    \"sha256\": \"gC3dAYli194W3bOWM306mV2isnQz4HUlBujjZYHawpE=\"
                },
                {
                     \"uri\": \"safestorage://PN_NOTIFICATION_ATTACHMENTS-1000029d58154e5192e176a31b7f22d2.pdf\",
                     \"order\": 1,
                     \"documentType\": \"ATTO\",
                     \"sha256\": \"MN14AU6XWWCgGiRI0mENrK8LrKdi8FhkXB1fhRtoff8=\"
                }
            ],
            \"printType\": \"BN_FRONTE_RETRO\",
            \"receiverName\": \"Leonardo Martini\",
            \"receiverNameRow2\": null,
            \"receiverAddress\": \"VIA_PN_2_CONS $TESTCASE\",
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
    done

}

echo "START test $IUN"
FILENAME="test_$IUN.txt"
echo "CONSOLIDATORE $IUN" > $FILENAME


#execute_call "RS" "30176" "VENEZIA" "VE" "ITALIA" 20
#execute_call "AR" "30121" "VENEZIA" "VE" "ITALIA" 24
#execute_call "890" "48121" "RAVENNA" "RA" "ITALIA" 20
#execute_call "RS" "16039" "RIVA TRIGOSO" "GE" "ITALIA" 24
#execute_call "AR" "11010" "ALLEIN" "AO" "ITALIA" 20
#execute_call "890" "12100" "CUNEO" "CN" "ITALIA" 20
#execute_call "RIS" "estero" "estero" "estero" "FRANCIA" 16
#execute_call "RIR" "estero" "estero" "estero" "AUSTRIA" 20


#execute_call "RS" "30176" "VENEZIA" "VE" "ITALIA" 20
#execute_call "890" "16011" "GENOVA" "GE" 10 "ARENZANO" "GE" "ITALIA" 20


#execute_call "890" "48121" "RAVENNA" "RA" "ITALIA" 10
#execute_call "AR" "30121" "VENEZIA" "VE" "ITALIA" 10

#execute_call "890" "98123" "MESSINA" "ME" "ITALIA" 10


#execute_call "890" "87027" "PAOLA" "CS" "ITALIA" 10
#execute_call "890" "98123" "MESSINA" "ME" "ITALIA" 10
#execute_call "890" "81100" "CASERTA" "CE" "ITALIA" 10



#execute_call "RS" "47030" "BORGHI" "FC" "ITALIA" 10
#execute_call "AR" "47030" "BORGHI" "FC" "ITALIA" 30
##execute_call "890" "47030" "BORGHI" "FC" "ITALIA" 30
#execute_call "RS" "60030" "BELVEDERE OSTRENSE" "AN" "ITALIA" 20
#execute_call "890" "60030" "BELVEDERE OSTRENSE" "AN" "ITALIA" 30
#execute_call "890" "38030" "CAMPESTRIN" "TN" "ITALIA" 10



#execute_call "RS" "16011" "GENOVA" "GE" "ITALIA" 10
#execute_call "890" "16011" "GENOVA" "GE" "ITALIA" 10
#execute_call "RS" "60012" "ANCONA" "AN" "ITALIA" 10
#execute_call "AR" "60012" "ANCONA" "AN" "ITALIA" 10
#execute_call "890" "60012" "ANCONA" "AN" "ITALIA" 10
#execute_call "RS" "60033" "ANCONA" "AN" "ITALIA" 10
#execute_call "AR" "60033" "ANCONA" "AN" "ITALIA" 10



#execute_call "RS" "16012" "GENOVA" "GE" "ITALIA" 10
#execute_call "AR" "16012" "GENOVA" "GE" "ITALIA" 10
#execute_call "890" "16012" "GENOVA" "GE" "ITALIA" 10
#execute_call "AR" "16011" "GENOVA" "GE" "ITALIA" 10
#execute_call "890" "60033" "ANCONA" "AN" "ITALIA" 10

#execute_call "RS" "81016" "CASERTA" "CE" "ITALIA" 20
#execute_call "AR" "82014" "BENEVENTO" "BN" "ITALIA" 20
#execute_call "AR" "83011" "AVELLINO" "AV" "ITALIA" 20

#execute_call "RS" "81016" "CASERTA" "CE" "ITALIA" 10
#execute_call "AR" "82014" "BENEVENTO" "BN" "ITALIA" 10
#execute_call "AR" "83011" "AVELLINO" "AV" "ITALIA" 10

#execute_call "RS" "16012" "GENOVA" "GE" "ITALIA" 10
#execute_call "RS" "60033" "ANCONA" "AN" "ITALIA" 10
#execute_call "890" "16012" "GENOVA" "GE" "ITALIA" 10

#execute_call "RS" "16012" "GENOVA" "GE" "ITALIA" 1
#execute_call "890" "16012" "GENOVA" "GE" "ITALIA" 5

#execute_call "890" "20001" "MILANO" "MI" "ITALIA" 5
#execute_call "890" "16011" "GENOVA" "GE" "ITALIA" 5

#execute_call "890" "16031" "BOGLIASCO" "GE" "ITALIA" 10
#execute_call "890" "80016" "MARANO DI NAPOLI" "NA" "ITALIA" 10
#execute_call "890" "60020" "AGUGLIANO" "AN" "ITALIA" 10
#execute_call "890" "20012" "CUGGIONO" "MI" "ITALIA" 10
#execute_call "890" "64015" "NERETO" "TE" "ITALIA" 10

#execute_call "890" "00010" "CASAPE" "RM" "ITALIA" 10
#execute_call "890" "00012" "GUIDONIA MONTECELIO" "RM" "ITALIA" 10
#execute_call "RS" "00010" "CASAPE" "RM" "ITALIA" 10
#execute_call "RS" "00012" "GUIDONIA MONTECELIO" "RM" "ITALIA" 10

#execute_call "890" "40010" "BENTIVOGLIO" "BO" "ITALIA" 15
#execute_call "AR" "40010" "BENTIVOGLIO" "BO" "ITALIA" 15

#execute_call "890" "00010" "CASAPE" "RM" "ITALIA" 10
#execute_call "890" "00012" "GUIDONIA MONTECELIO" "RM" "ITALIA" 10
#execute_call "AR" "06024" "GUBBIO" "PG" "ITALIA" 10
#execute_call "AR" "30031" "DOLO" "VE" "ITALIA" 10

#execute_call "RS" "80012" "CALVIZZANO" "NA" "ITALIA" 100
#execute_call "RS" "00013" "FONTE NUOVA" "RM" "ITALIA" 100

#execute_call "AR" "80012" "CALVIZZANO" "NA" "ITALIA" 3000

#execute_call "AR" "06024" "GUBBIO" "PG" "ITALIA" 20
#execute_call "AR" "30031" "DOLO" "VE" "ITALIA" 20
#execute_call "890" "16011" "GENOVA" "GE" "ITALIA" 10
#execute_call "890" "16012" "GENOVA" "GE" "ITALIA" 10
#execute_call "RIS" "estero" "estero" "estero" "FRANCIA" 10
#execute_call "RIS" "estero" "estero" "estero" "GERMANIA" 10

#execute_call "890" "33010" "BORDANO" "UD" "ITALIA" 10

#execute_call "890" "00010" "CASAPE" "RM" "ITALIA" 20
#execute_call "AR" "06024" "GUBBIO" "PG" "ITALIA" 20
#execute_call "RIS" "estero" "estero" "estero" "CANADA" 20
#execute_call "890" "80023" "CAIVANO" "NA" "ITALIA" 20
#execute_call "RS" "60012" "ANCONA" "AN" "ITALIA" 20



#Comune di Parma
#execute_call "890" "43051" "ALBARETO" "PR" "ITALIA" 5

#Comune di Pagani
#execute_call "890" "84016" "PAGANI" "SA" "ITALIA" 5

#Regione Lombardia
#execute_call "890" "20001" "MILANO" "MI" "ITALIA" 5

#Aci Campania
#execute_call "890" "80023" "CAIVANO" "NA" "ITALIA" 5

#Aci Puglia
#execute_call "890" "71021" "ACCADIA" "FG" "ITALIA" 5

#Marche
#execute_call "890" "63900" "FERMO" "FM" "ITALIA" 5

#execute_call "AR" "06024" "GUBBIO" "PG" "ITALIA" 8
#execute_call "AR" "06100" "PERUGIA" "PG" "ITALIA" 2 # errore, codice generico
#execute_call "RS" "30171" "VENEZIA" "VE" "ITALIA" 8
#execute_call "RS" "30100" "VENEZIA" "VE" "ITALIA" 2 # errore, codice generico

#execute_call "890" "00010" "CASAPE" "RM" "ITALIA" 20
#execute_call "RS" "06135" "PERUGIA" "PG" "ITALIA" 20
#execute_call "RS" "07010" "ANELA" "SS" "ITALIA" 20
#execute_call "RS" "50026" "MERCATALE" "FI" "ITALIA" 20

#execute_call "890" "00010" "CASAPE" "RM" "ITALIA" 20

#execute_call "AR" "06024" "GUBBIO" "PG" "ITALIA" 34
#execute_call "RS" "30171" "VENEZIA" "VE" "ITALIA" 32

#execute_call "890" "33010" "BORDANO" "UD" "ITALIA" 4
#execute_call "890" "33010" "BORDANO" "UD" "ITALIA" 2

#execute_call "AR" "80012" "CALVIZZANO" "NA" "ITALIA" 1000
#execute_call "AR" "80010" "QUARTO" "NA" "ITALIA" 1000

#execute_call "AR" "80012" "CALVIZZANO" "NA" "ITALIA" 2000
#execute_call "AR" "80010" "QUARTO" "NA" "ITALIA" 2000

# execute_call "AR" "80010" "QUARTO" "NA" "ITALIA" 32

#execute_call "AR" "80010" "QUARTO" "NA" "ITALIA" 3000

#execute_call "AR" "80010" "QUARTO" "NA" "ITALIA" 5

#execute_call "AR" "60010" "BARBARA" "AN" "ITALIA" 10
#execute_call "AR" "60010" "BARBARA" "AN" "ITALIA" 10
#execute_call "AR" "60010" "BARBARA" "AN" "ITALIA" 10

#execute_call "AR" "60010" "BARBARA" "AN" "ITALIA" 12

#execute_call "RIR" "DUBAI" "DUBAI" "AE" "EMIRATI ARABI UNITI" 12

#execute_call "RS" "00010" "CASAPE" "RM" "ITALIA" 10
#execute_call "890" "42023" "ARGINE" "RE" "ITALIA" 10

#execute_call "890" "50012" "ANTELLA" "FI" "ITALIA" 10

#execute_call "AR" "75010" "ALIANO" "MT" "ITALIA" 10
#execute_call "AR" "64010" "ANCARANO" "TE" "ITALIA" 10

execute_call "AR" "64010" "ANCARANO" "TE" "ITALIA" 2
