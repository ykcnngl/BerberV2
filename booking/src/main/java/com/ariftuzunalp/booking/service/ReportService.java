package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.dto.ReportResponse;
import com.ariftuzunalp.booking.dto.ReportResponse.EmployeeStats;
import com.ariftuzunalp.booking.dto.ReportResponse.ServiceStats;
import com.ariftuzunalp.booking.dto.ReportResponse.Stats;
import com.ariftuzunalp.booking.entity.Appointment;
import com.ariftuzunalp.booking.entity.AppointmentStatus;
import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.repository.AppointmentRepository;
import com.ariftuzunalp.booking.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

// Yönetici paneli: ciro ve kimin hangi hizmetten kaç işlem yaptığı
@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class ReportService {

    private static final int MAX_RANGE_DAYS = 366;

    private final AppointmentRepository appointmentRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional(readOnly = true)
    public ReportResponse getReport(LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BusinessException("Bitiş tarihi başlangıç tarihinden önce olamaz.");
        }
        if (ChronoUnit.DAYS.between(from, to) >= MAX_RANGE_DAYS) {
            throw new BusinessException("En fazla 1 yıllık rapor alınabilir.");
        }

        // Saati gelmemiş randevular henüz yapılmadığı için rapora girmez
        LocalDateTime now = LocalDateTime.now();
        List<Appointment> past = appointmentRepository.findForReport(
                        from.atStartOfDay(), to.plusDays(1).atStartOfDay(), AppointmentStatus.CANCELLED)
                .stream()
                .filter(a -> a.getStartTime().isBefore(now))
                .toList();

        // Aktif çalışanların hepsi listelenir (işlemi olmayan sıfır görünür); pasif çalışan yalnızca işlemi varsa
        List<EmployeeStats> employees = employeeRepository.findAll().stream()
                .sorted(Comparator.comparing(Employee::getFirstName).thenComparing(Employee::getLastName))
                .map(e -> new EmployeeStats(e.getId(), e.getFirstName() + " " + e.getLastName(),
                        stats(past.stream().filter(a -> a.getEmployee().getId().equals(e.getId())).toList()),
                        e.isActive()))
                .filter(s -> s.active() || s.stats().count() + s.stats().noShowCount() > 0)
                .toList();

        return new ReportResponse(from, to, stats(past), employees);
    }

    private static Stats stats(List<Appointment> appointments) {
        long noShow = appointments.stream().filter(a -> a.getStatus() == AppointmentStatus.NO_SHOW).count();
        List<Appointment> done = appointments.stream()
                .filter(a -> a.getStatus() != AppointmentStatus.NO_SHOW)
                .toList();
        List<ServiceStats> services = done.stream()
                .collect(Collectors.groupingBy(a -> a.getService().getName()))
                .entrySet().stream()
                .map(e -> new ServiceStats(e.getKey(), e.getValue().size(), sum(e.getValue())))
                .sorted(Comparator.comparingLong(ServiceStats::count).reversed()
                        .thenComparing(ServiceStats::serviceName))
                .toList();
        return new Stats(done.size(), sum(done), noShow, services);
    }

    private static BigDecimal sum(List<Appointment> appointments) {
        return appointments.stream().map(ReportService::priceOf).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    // Fiyat kaydı olmayan eski randevularda hizmetin güncel fiyatı kullanılır
    private static BigDecimal priceOf(Appointment a) {
        if (a.getPrice() != null) return a.getPrice();
        BigDecimal servicePrice = a.getService().getPrice();
        return servicePrice != null ? servicePrice : BigDecimal.ZERO;
    }
}
