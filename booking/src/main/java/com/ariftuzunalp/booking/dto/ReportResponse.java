package com.ariftuzunalp.booking.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

// Yönetici raporu: seçilen tarih aralığında yapılan (saati geçmiş, iptal edilmemiş, "gelmedi" olmayan) işlemler.
// "total" tüm salonu, "employees" her çalışanı ayrı ayrı verir.
public record ReportResponse(LocalDate from, LocalDate to, Stats total, List<EmployeeStats> employees) {

    public record Stats(long count, BigDecimal revenue, long noShowCount, List<ServiceStats> services) {
    }

    public record EmployeeStats(UUID employeeId, String employeeName, Stats stats, boolean active) {
    }

    public record ServiceStats(String serviceName, long count, BigDecimal revenue) {
    }
}
