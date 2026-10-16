package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.entity.Service;

import java.time.DayOfWeek;
import java.util.List;
import java.util.UUID;

// Yönetici paneli için tam çalışan bilgisi (pasif çalışanlar dahil)
public record AdminEmployeeResponse(
        UUID id,
        String firstName,
        String lastName,
        String phone,
        boolean active,
        List<UUID> serviceIds,
        List<DayOfWeek> weeklyOffDays
) {
    public static AdminEmployeeResponse from(Employee e) {
        return new AdminEmployeeResponse(
                e.getId(),
                e.getFirstName(),
                e.getLastName(),
                e.getPhone(),
                e.isActive(),
                e.getServices() == null ? List.of() : e.getServices().stream().map(Service::getId).toList(),
                e.getWeeklyOffDays().stream().sorted().toList());
    }
}
