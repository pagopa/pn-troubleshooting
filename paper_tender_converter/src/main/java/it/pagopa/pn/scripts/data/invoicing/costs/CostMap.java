package it.pagopa.pn.scripts.data.invoicing.costs;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.opencsv.CSVReader;
import com.opencsv.exceptions.CsvValidationException;
import it.pagopa.pn.scripts.data.invoicing.costs.model.CostDTO;
import it.pagopa.pn.scripts.data.invoicing.costs.model.InternationalZoneEnum;
import it.pagopa.pn.scripts.data.invoicing.costs.model.ProductTypeEnumDto;


public class CostMap {

    private static final String TENDER_CURL = "curl --location --request POST \"${_BASEURI}/paper-channel-bo/v1/$_GARA/delivery-driver/%s/cost\" --header 'Content-Type: application/json' --data '%s'";

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
                 .map( k -> "peso_max_" + k.toString() + "g" )
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

    public String toCurl(){


        Map<String, CostDTO> tenderMap = convertToCostDTO(costMap);

        ObjectMapper mapper = new ObjectMapper();
        mapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);

        StringBuffer sb = new StringBuffer();

        for( String key: tenderMap.keySet().stream().sorted().collect(Collectors.toList())){

            CostDTO costRow = tenderMap.get(key);

            try {
                String caption = String.format("#### %s [%s]", key, (tenderMap.get(key).getCap()!=null ? tenderMap.get(key).getCap().size() : tenderMap.get(key).getZone()));
                String curl = String.format(TENDER_CURL, String.format("${_%s_UUID}", costRow.getDriverCode()), mapper.writeValueAsString(costRow));

                sb.append(caption).append(System.lineSeparator()).append(curl).append(System.lineSeparator());

            } catch (JsonProcessingException e) {
                throw new RuntimeException(e);
            }

        }

        return sb.toString();

    }

    private Map<String, CostDTO> convertToCostDTO(SortedMap<String, PaperCostsOneProductType> costMap) {

        Map<String, CostDTO> distinctMap = new HashMap<>();


        for(Map.Entry<String, PaperCostsOneProductType> entry:  costMap.entrySet()){

            PaperCostsOneProductType costEntry = entry.getValue();

            String key = computeTenderKey(costEntry);

            if(!distinctMap.containsKey(key)){

                CostDTO costDTO = new CostDTO();
                costDTO.setDriverCode(costEntry.getRecapitista().contains("FSU") ? "FSU": costEntry.getRecapitista().replaceAll("[^\\w]", "").toUpperCase());
                costDTO.setPrice(costEntry.getCostoRecapitistaPerPeso().get(20).divide(new BigDecimal(100)));
                costDTO.setPriceAdditional(costEntry.getConsolidatoreCostoFogliOltreIlPrimo().divide(new BigDecimal(100)));
                costDTO.setProductType(ProductTypeEnumDto.fromValue(costEntry.getSvcType()));
                //TODO: fix altro peso
                distinctMap.put(key, costDTO);

            }

            if(costEntry.getGeographicalKey().startsWith("ZONE")){
                distinctMap.get(key).setZone(InternationalZoneEnum.fromValue(costEntry.getGeographicalKey()));
            } else {
                distinctMap.get(key).addCapItem(costEntry.getGeographicalKey());
            }


        }
        return distinctMap;
    }

    private String computeTenderKey(PaperCostsOneProductType cost) {
        return   cost.getSvcType() + "-"
                + cost.getRecapitista() + "-"
                + cost.getConsolidatoreCostoFogliOltreIlPrimo() + "-"
                + cost.getCostoRecapitistaPerPeso()
                .entrySet()
                .stream()
                .map( x -> x.getValue().toString() )
                .collect( Collectors.joining("-"));

    }


}
