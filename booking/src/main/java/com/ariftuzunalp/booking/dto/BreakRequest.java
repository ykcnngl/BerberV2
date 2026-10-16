package com.ariftuzunalp.booking.dto;

import lombok.Data;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;

// breakDate dolu -> sadece o tarih; dayOfWeek dolu -> her hafta o gün; ikisi de boş -> her gün
@Data
public class BreakRequest {
    private LocalDate breakDate;
    private DayOfWeek dayOfWeek;
    private LocalTime startTime;
    private LocalTime endTime;
    private String reason;
}
