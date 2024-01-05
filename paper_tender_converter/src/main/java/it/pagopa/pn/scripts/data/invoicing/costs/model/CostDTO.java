package it.pagopa.pn.scripts.data.invoicing.costs.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * CostDTO
 */

public class CostDTO   {

    @JsonProperty("price")
    private BigDecimal price;

    @JsonProperty("priceAdditional")
    private BigDecimal priceAdditional;

    @JsonProperty("productType")
    private ProductTypeEnumDto productType;

    @JsonProperty("cap")
    private List<String> cap = null;

    @JsonProperty("zone")
    private InternationalZoneEnum zone;


    @JsonIgnore
    private String driverCode;

    public CostDTO price(BigDecimal price) {
        this.price = price;
        return this;
    }

    /**
     * Get price
     * minimum: 0
     * maximum: 999999
     * @return price
     */
    public BigDecimal getPrice() {
        return price;
    }

    public void setPrice(BigDecimal price) {
        this.price = price;
    }

    public CostDTO priceAdditional(BigDecimal priceAdditional) {
        this.priceAdditional = priceAdditional;
        return this;
    }

    /**
     * Get priceAdditional
     * minimum: 0
     * maximum: 999999
     * @return priceAdditional
     */
    public BigDecimal getPriceAdditional() {
        return priceAdditional;
    }

    public void setPriceAdditional(BigDecimal priceAdditional) {
        this.priceAdditional = priceAdditional;
    }

    public CostDTO productType(ProductTypeEnumDto productType) {
        this.productType = productType;
        return this;
    }

    /**
     * Get productType
     * @return productType
     */
    public ProductTypeEnumDto getProductType() {
        return productType;
    }

    public void setProductType(ProductTypeEnumDto productType) {
        this.productType = productType;
    }

    public CostDTO cap(List<String> cap) {
        this.cap = cap;
        return this;
    }

    public CostDTO addCapItem(String capItem) {
        if (this.cap == null) {
            this.cap = new ArrayList<String>();
        }
        this.cap.add(capItem);
        return this;
    }

    /**
     * Get cap
     * @return cap
     */

    public List<String> getCap() {
        return cap;
    }

    public void setCap(List<String> cap) {
        this.cap = cap;
    }

    public CostDTO zone(InternationalZoneEnum zone) {
        this.zone = zone;
        return this;
    }

    /**
     * Get zone
     * @return zone
     */
    public InternationalZoneEnum getZone() {
        return zone;
    }

    public void setZone(InternationalZoneEnum zone) {
        this.zone = zone;
    }

    public String getDriverCode() {
        return driverCode;
    }

    public void setDriverCode(String driverCode) {
        this.driverCode = driverCode;
    }

}
