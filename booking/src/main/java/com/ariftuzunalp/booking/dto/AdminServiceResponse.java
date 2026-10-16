package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.Service;

import java.math.BigDecimal;
import java.util.UUID;

// Yönetici paneli için hizmet bilgisi (pasif hizmetler dahil)
public record AdminServiceResponse(UUID id, String name, int durationMinutes, BigDecimal price, boolean active) {
    public static AdminServiceResponse from(Service s) {
        return new AdminServiceResponse(s.getId(), s.getName(), s.getDurationMinutes(), s.getPrice(), s.isActive());
    }
}
