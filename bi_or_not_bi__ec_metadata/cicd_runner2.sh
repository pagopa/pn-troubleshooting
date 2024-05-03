COMMANDLINE="shipperReliabilityReport \
                    --report /Users/lap-mbp16-n01-0346/Documents/Sviluppo/SEND/pn-prototypes/analog-delivery-monitoring/reports/ShipperReliabilityReport.json \
                    --source-path /Users/lap-mbp16-n01-0346/Documents/Sviluppo/SEND/pn-prototypes \
                    --export-bucket test-bucket"

export MAVEN_OPTS="-Xmx8g \
    --add-opens java.base/sun.nio.ch=ALL-UNNAMED \
    --add-opens java.base/sun.security.action=ALL-UNNAMED \
    --add-opens java.base/sun.util.calendar=ALL-UNNAMED"

ARGUMENTS=$( echo $COMMANDLINE | sed -e 's/  */,/g' )
./mvnw compile
./mvnw exec:java -Dexec.arguments=${ARGUMENTS} -DCORE=pn-datamonitoring-eu-south-1-830192246553 -DCORE_BUCKET=pn-datamonitoring-eu-south-1-‭089813480515‬



pn-datamonitoring-eu-south-1-830192246553
pn-datamonitoring-eu-south-1-089813480515