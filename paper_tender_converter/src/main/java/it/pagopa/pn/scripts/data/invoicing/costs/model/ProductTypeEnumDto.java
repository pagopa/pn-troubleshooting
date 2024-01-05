package it.pagopa.pn.scripts.data.invoicing.costs.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/**
 * Gets or Sets ProductTypeEnumDto
 */

public enum ProductTypeEnumDto {

    AR("AR"),

    _890("890"),

    RS("RS");

    private String value;

    ProductTypeEnumDto(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @Override
    public String toString() {
        return String.valueOf(value);
    }

    @JsonCreator
    public static ProductTypeEnumDto fromValue(String value) {
        for (ProductTypeEnumDto b : ProductTypeEnumDto.values()) {
            if (b.value.equals(value)) {
                return b;
            }
        }
        throw new IllegalArgumentException("Unexpected value '" + value + "'");
    }
}

