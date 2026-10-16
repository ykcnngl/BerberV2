package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.entity.Service;

import java.time.DayOfWeek;
import java.util.List;
import java.util.UUID;

// Müşteriye açık ekip üyesi bilgisi (telefon gibi kişisel bilgiler içermez)
public record EmployeeResponse(UUID id, String name, List<UUID> serviceIds, List<DayOfWeek> weeklyOffDays) {
    public static EmployeeResponse from(Employee e) {
        List<UUID> serviceIds = e.getServices() == null ? List.of()
                : e.getServices().stream().map(Service::getId).toList();
        return new EmployeeResponse(e.getId(), e.getFirstName() + " " + e.getLastName(), serviceIds,
                e.getWeeklyOffDays().stream().sorted().toList());
    }
}
