package it.pagopa.pn.scripts.data.invoicing.costs;

import java.math.BigDecimal;
import java.util.SortedMap;
import java.util.TreeMap;
import java.util.stream.Collectors;


public class PaperCostsOneProductType {
    private String geographicalKey;
    private String svcType;
    private String recapitista;
    private BigDecimal consolidatoreCostoBase;
    private BigDecimal consolidatoreCostoFogliOltreIlPrimo;

    private SortedMap<Integer, BigDecimal> costoRecapitistaPerPeso = new TreeMap<>();

    public PaperCostsOneProductType(
      String geographicalKey,
      String svcType,
      String recapitista,
      BigDecimal consolidatoreCostoBase,
      BigDecimal consolidatoreCostoFogliOltreIlPrimo
    ) {
      this.geographicalKey = geographicalKey;
      this.svcType = svcType;
      this.recapitista = recapitista;
      this.consolidatoreCostoBase = consolidatoreCostoBase;
      this.consolidatoreCostoFogliOltreIlPrimo = consolidatoreCostoFogliOltreIlPrimo;
    }

    public String getGeographicalKey() {
        return geographicalKey;
    }

    public String getSvcType() {
        return svcType;
    }

    public void setSvcType(String svcType) {
        this.svcType = svcType;
    }

    public String getRecapitista() {
        return recapitista;
    }

    public void setRecapitista(String recapitista) {
        this.recapitista = recapitista;
    }

    public BigDecimal getConsolidatoreCostoBase() {
        return consolidatoreCostoBase;
    }

    public void setConsolidatoreCostoBase(BigDecimal consolidatoreCostoBase) {
        this.consolidatoreCostoBase = consolidatoreCostoBase;
    }

    public BigDecimal getConsolidatoreCostoFogliOltreIlPrimo() {
        return consolidatoreCostoFogliOltreIlPrimo;
    }

    public void setConsolidatoreCostoFogliOltreIlPrimo(BigDecimal consolidatoreCostoFogliOltreIlPrimo) {
        this.consolidatoreCostoFogliOltreIlPrimo = consolidatoreCostoFogliOltreIlPrimo;
    }

    public SortedMap<Integer, BigDecimal> getCostoRecapitistaPerPeso() {
        return costoRecapitistaPerPeso;
    }

    public void setCostoRecapitistaPerPeso(SortedMap<Integer, BigDecimal> costoRecapitistaPerPeso) {
        this.costoRecapitistaPerPeso = costoRecapitistaPerPeso;
    }

    public PaperCostsOneProductType addCost( Integer maxWeightGrams, BigDecimal costEuroCent ) {
      this.costoRecapitistaPerPeso.put( maxWeightGrams, costEuroCent );
      return this;
    }

    public PaperCostsOneProductType withGeoKeyAndProduct( String geoKey, String product ) {
      PaperCostsOneProductType result = new PaperCostsOneProductType( geoKey, product, 
                   recapitista, consolidatoreCostoBase,consolidatoreCostoFogliOltreIlPrimo);
      costoRecapitistaPerPeso.forEach( ( w, c ) -> result.addCost(w, c) );
      return result;
    }

    @Override
    public String toString() {
      return "Key[" + geographicalKey + " " + svcType + "]" 
             + " ConsCost(" +  consolidatoreCostoBase + " + <nFogli -1> x " + consolidatoreCostoFogliOltreIlPrimo
             + " RecCost(" + costoRecapitistaPerPeso.entrySet().stream()
                  .map( entry -> "<" + entry.getKey() + "g -> " + entry.getValue())
                  .collect(Collectors.joining(" ; "))
             + ")"
             + " Recap(" + recapitista + ")"; 
    }
}
