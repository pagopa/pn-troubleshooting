package it.pagopa.pn.scripts.ecmetadata.checks;

import org.jetbrains.annotations.NotNull;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ExtractorDayAggregator {

    private final int fileMinRows;
    private final int fileMaxRows;

    public ExtractorDayAggregator(int fileMinRows, int fileMaxRows) {
        this.fileMinRows = fileMinRows;
        this.fileMaxRows = fileMaxRows;
    }

    @NotNull
    public Map<String, List<ExtractionInterval>> computeExtractionsListFromSummary(Map<String, List<CardinalityByProductAndDayRow>> daySummaries) {
        Map<String, List<ExtractionInterval>> extractions = new HashMap<>();
        daySummaries.keySet().forEach( (key) -> {
            List<CardinalityByProductAndDayRow> days = daySummaries.get( key );

            List<ExtractionInterval> productExtractions = this.compatDays( days );
            extractions.put( key, productExtractions );
        });
        return extractions;
    }

    private List<ExtractionInterval> compatDays(List<CardinalityByProductAndDayRow> days) {
        List<ExtractionInterval> result = new ArrayList<>();
        ExtractionInterval currentExtraction = null;

        for( CardinalityByProductAndDayRow day: days ) {
            if( currentExtraction == null ) {
                currentExtraction = new ExtractionInterval( day );
            }
            else {
                AggregationDecision what = currentExtraction.checkCardinality( day, fileMinRows, fileMaxRows );
                switch ( what ) {
                    case CONTINUE -> {
                        currentExtraction = currentExtraction.addDay( day );
                    }
                    case STOP -> {
                        currentExtraction = currentExtraction.addDay( day );
                        result.add( currentExtraction );
                        currentExtraction = null;
                    }
                    case PUSHBACK -> {
                        result.add( currentExtraction );
                        currentExtraction = new ExtractionInterval( day );
                    }
                }
            }
        }
        if( currentExtraction != null ) {
            result.add( currentExtraction );
        }
        return result;
    }

    public static class CardinalityByProductAndDayRow implements Serializable {


        private String papeprMeta_productType;
        private String day;
        private long cardinality;

        public String getPapeprMeta_productType() {
            return papeprMeta_productType;
        }

        public void setPapeprMeta_productType(String papeprMeta_productType) {
            this.papeprMeta_productType = papeprMeta_productType;
        }

        public String getDay() {
            return day;
        }

        public void setDay(String day) {
            this.day = day;
        }

        public long getCardinality() {
            return cardinality;
        }

        public void setCardinality(long cardinality) {
            this.cardinality = cardinality;
        }
    }

    public static class ExtractionInterval {
        private String from;

        private String to;

        private long cardinality;

        private ExtractionInterval() {}

        private ExtractionInterval( CardinalityByProductAndDayRow day ) {
            this.from = day.getDay();
            this.to = day.getDay();

            this.cardinality = day.getCardinality();
        }

        public ExtractionInterval addDay( CardinalityByProductAndDayRow day ) {
            ExtractionInterval result = new ExtractionInterval();
            result.from = this.from;
            result.to = day.getDay();
            result.cardinality = this.cardinality + day.getCardinality();
            return result;
        }

        public AggregationDecision checkCardinality( CardinalityByProductAndDayRow day, int minRows, int maxRows ) {
            AggregationDecision result;

            long newTotal = this.cardinality + day.cardinality;

            if (newTotal < minRows ) {
                result = AggregationDecision.CONTINUE;
            }
            else if(newTotal < maxRows) {
                result = AggregationDecision.STOP;
            }
            else {
                result = AggregationDecision.PUSHBACK;
            }

            return result;
        }

        @Override
        public String toString() {
            return "ExtractionInterval{" +
                    "from='" + from + '\'' +
                    ", to='" + to + '\'' +
                    ", cardinality=" + cardinality +
                    '}';
        }

        public String getFrom() {
            return from;
        }

        public String getTo() {
            return to;
        }
    }

    private enum AggregationDecision {
        CONTINUE,
        STOP,
        PUSHBACK
    }
}
