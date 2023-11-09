package it.pagopa.pn.scripts.data.invoicing.costs;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;
import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;


public class CostMap {

    private SortedMap<String, PaperCostsOneProductType> costMap;

    public CostMap() {
        this.costMap = new TreeMap<>();
    }

    public CostMap(Collection<PaperCostsOneProductType> costs ) {
      this();
      for( PaperCostsOneProductType cost: costs) {
        this.add( cost );
      }
    }

    public void add( PaperCostsOneProductType cost ) {
        this.costMap.put( computeKey(cost), cost );
    }

    private String computeKey( PaperCostsOneProductType cost ) {
        return computeKey( cost.getGeographicalKey(), cost.getSvcType() );
    }

    private String computeKey( String geoKey, String productType ) {
      return geoKey + " " + productType;
    }

    public PaperCostsOneProductType get(String zipCode, String state, String productType ) {
        PaperCostsOneProductType result = costMap.get( computeKey( state, productType ));
        if( result == null ) {
            result = costMap.get( computeKey( zipCode, productType ));
        }
        return result;
    }

    @Override
    public String toString() {
        return costMap.entrySet().stream()
                      .map( entry-> entry.getValue().toString() )
                      .collect(Collectors.joining("\n"));
    }

    public String toCsv() {
      String headerCsv = headerCsv();
      String bodyCsv = costMap.entrySet().stream()
                              .map( entry -> oneLineCsv( entry.getValue() ))
                              .collect(Collectors.joining("\n"));
      return headerCsv + "\n" + bodyCsv + "\n";
    }

    private String headerCsv() {
      return "geo_key,product_type," 
           + "recapitista," 
           + "cons_costo_base,const_costo_foglio_agg,"
           + costMap.values().iterator().next().getCostoRecapitistaPerPeso()
                 .keySet()
                 .stream()
                 .map( k -> k.toString() )
                 .collect( Collectors.joining(","));
    }

    private String oneLineCsv( PaperCostsOneProductType cost) {
      return cost.getGeographicalKey() + "," + cost.getSvcType() + ","
           + cost.getRecapitista() + ","
           + cost.getConsolidatoreCostoBase() + "," + cost.getConsolidatoreCostoFogliOltreIlPrimo() + ","
           + cost.getCostoRecapitistaPerPeso()
                 .entrySet()
                 .stream()
                 .map( x -> x.getValue().toString() )
                 .collect( Collectors.joining(","));
    }
}
