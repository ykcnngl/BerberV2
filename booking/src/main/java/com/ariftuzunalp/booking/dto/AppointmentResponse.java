package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.Appointment;
import com.ariftuzunalp.booking.entity.AppointmentStatus;

import java.time.LocalDateTime;
import java.util.UUID;

// Entity yerine dışarıya dönülen randevu verisi (Hibernate proxy'leri JSON'a girmez)
public record AppointmentResponse(
        UUID id,
        LocalDateTime startTime,
        LocalDateTime endTime,
        AppointmentStatus status,
        String customerFullName,
        String customerPhone,
        String employeeName,
        String serviceName
) {
    public static AppointmentResponse from(Appointment a) {
        return new AppointmentResponse(
                a.getId(),
                a.getStartTime(),
                a.getEndTime(),
                a.getStatus(),
                a.getCustomer().getFullName(),
                a.getCustomer().getPhone(),
                a.getEmployee().getFirstName() + " " + a.getEmployee().getLastName(),
                a.getService().getName()
        );
    }
}
