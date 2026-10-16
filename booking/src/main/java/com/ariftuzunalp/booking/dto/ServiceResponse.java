package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.Service;

import java.util.UUID;

// Sitede fiyat gösterilmez
public record ServiceResponse(UUID id, String name, int durationMinutes) {
    public static ServiceResponse from(Service s) {
        return new ServiceResponse(s.getId(), s.getName(), s.getDurationMinutes());
    }
}
