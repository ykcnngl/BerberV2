package com.ariftuzunalp.booking.dto;

import lombok.Data;

import java.time.LocalDate;

@Data
public class LeaveRequest {
    private LocalDate startDate;
    private LocalDate endDate;
    private String reason;
}
