package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.EmployeeLeave;

import java.time.LocalDate;
import java.util.UUID;

public record LeaveResponse(UUID id, LocalDate startDate, LocalDate endDate, String reason) {
    public static LeaveResponse from(EmployeeLeave l) {
        return new LeaveResponse(l.getId(), l.getStartDate(), l.getEndDate(), l.getReason());
    }
}
