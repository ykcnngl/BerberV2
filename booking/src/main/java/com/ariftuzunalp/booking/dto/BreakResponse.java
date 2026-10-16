package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.EmployeeBreak;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

public record BreakResponse(UUID id, LocalDate breakDate, DayOfWeek dayOfWeek,
                            LocalTime startTime, LocalTime endTime, String reason) {
    public static BreakResponse from(EmployeeBreak b) {
        return new BreakResponse(b.getId(), b.getBreakDate(), b.getDayOfWeek(),
                b.getStartTime(), b.getEndTime(), b.getReason());
    }
}
