package com.ariftuzunalp.booking.dto;

import lombok.Data;
import java.time.LocalDateTime;
import java.util.UUID;

@Data
public class AppointmentRequest {
    private String customerFullName;
    private String customerPhone;
    private UUID employeeId;
    private UUID serviceId;
    private LocalDateTime startTime;
}