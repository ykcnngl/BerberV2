package com.ariftuzunalp.booking.notification;

import java.time.LocalDateTime;

// Müşteri randevu aldığında yayınlanır; randevu veritabanına yazıldıktan sonra müşteriye onay SMS'i gider
public record AppointmentCreatedEvent(
        String customerName,
        String customerPhone,
        String serviceName,
        String employeeName,
        LocalDateTime startTime
) {
}
