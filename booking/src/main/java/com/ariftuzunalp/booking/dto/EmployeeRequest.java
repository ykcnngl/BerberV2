package com.ariftuzunalp.booking.dto;

import lombok.Data;

import java.time.DayOfWeek;
import java.util.List;
import java.util.UUID;

@Data
public class EmployeeRequest {
    private String firstName;
    private String lastName;
    private String phone;
    private List<UUID> serviceIds;
    private List<DayOfWeek> weeklyOffDays;
}
