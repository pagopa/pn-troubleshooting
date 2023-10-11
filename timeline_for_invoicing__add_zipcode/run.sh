#! /bin/sh

mkdir ./classes
javac -classpath ./libs/jettison-1.5.4.jar \
      -d classes \
      ./src/java/it/pagopa/pn/scripts/data/invoicing/*.java

mkdir ./out
rm -rf ./out/TABLE_NAME_*

jshell --class-path ./libs/jettison-1.5.4.jar:./classes src/java/Script.java \
    "-R-Xmx2g" \
    "-R-Darg1=/Users/mvit/Documents/pn/pn-troubleshooting/bi_or_not_bi/rstudio-server/workspace/data/ConfinfoCdc/dump/data" \
    "-R-Darg2=/Users/mvit/Documents/pn/pn-troubleshooting/bi_or_not_bi/rstudio-server/workspace/data/cdc/TABLE_NAME_pn-TimelinesForInvoicing" \
    "-R-Darg3=/Users/mvit/Documents/pn/pn-troubleshooting/timeline_for_invoicing__add_zipcode/out/TABLE_NAME_pn-TimelinesForInvoicing"

echo "Ended with exit code $?"

tar cvzf ./out/pn-TimelineForInvoicing-redo-until-202309.tgz ./out/TABLE_NAME_pn-TimelinesForInvoicing
echo "Archive Generated in ./out/pn-TimelineForInvoicing-redo-until-202309.tgz"
