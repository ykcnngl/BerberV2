package com.ariftuzunalp.booking.notification;

import java.time.LocalDateTime;

// Yönetici bir randevuyu iptal ettiğinde yayınlanır; işlem veritabanına yazıldıktan sonra müşteriye SMS gider
public record AppointmentCancelledByAdminEvent(
        String customerName,
        String customerPhone,
        String serviceName,
        String employeeName,
        LocalDateTime startTime
) {
}
