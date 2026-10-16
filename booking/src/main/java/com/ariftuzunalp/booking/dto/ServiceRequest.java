package com.ariftuzunalp.booking.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ServiceRequest {
    private String name;
    private Integer durationMinutes;
    private BigDecimal price;
}
