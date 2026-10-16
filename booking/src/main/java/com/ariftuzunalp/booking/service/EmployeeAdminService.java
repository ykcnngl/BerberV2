package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.dto.AdminEmployeeResponse;
import com.ariftuzunalp.booking.dto.BreakRequest;
import com.ariftuzunalp.booking.dto.BreakResponse;
import com.ariftuzunalp.booking.dto.EmployeeRequest;
import com.ariftuzunalp.booking.dto.LeaveRequest;
import com.ariftuzunalp.booking.dto.LeaveResponse;
import com.ariftuzunalp.booking.entity.AppointmentStatus;
import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.entity.EmployeeBreak;
import com.ariftuzunalp.booking.entity.EmployeeLeave;
import com.ariftuzunalp.booking.entity.Role;
import com.ariftuzunalp.booking.entity.Service;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.exception.NotFoundException;
import com.ariftuzunalp.booking.repository.AppointmentRepository;
import com.ariftuzunalp.booking.repository.EmployeeBreakRepository;
import com.ariftuzunalp.booking.repository.EmployeeLeaveRepository;
import com.ariftuzunalp.booking.repository.EmployeeRepository;
import com.ariftuzunalp.booking.repository.ServiceRepository;
import com.ariftuzunalp.booking.util.PhoneUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

// Yönetici paneli: çalışan ekleme/düzenleme, mola ve izin tanımlama
@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class EmployeeAdminService {

    private final EmployeeRepository employeeRepository;
    private final ServiceRepository serviceRepository;
    private final EmployeeBreakRepository breakRepository;
    private final EmployeeLeaveRepository leaveRepository;
    private final AppointmentRepository appointmentRepository;

    // --- ÇALIŞANLAR ---

    @Transactional(readOnly = true)
    public List<AdminEmployeeResponse> listEmployees() {
        return employeeRepository.findAll().stream()
                .sorted(Comparator.comparing(Employee::isActive).reversed()
                        .thenComparing(Employee::getFirstName))
                .map(AdminEmployeeResponse::from)
                .toList();
    }

    @Transactional
    public AdminEmployeeResponse createEmployee(EmployeeRequest request) {
        Employee employee = Employee.builder()
                .role(Role.STAFF)
                .isActive(true)
                .build();
        apply(employee, request);
        return AdminEmployeeResponse.from(employeeRepository.save(employee));
    }

    @Transactional
    public AdminEmployeeResponse updateEmployee(UUID id, EmployeeRequest request) {
        Employee employee = findEmployee(id);
        apply(employee, request);
        return AdminEmployeeResponse.from(employee);
    }

    // Çalışan silinmez, pasife alınır: geçmiş randevular korunur, yeni randevu alınamaz
    @Transactional
    public AdminEmployeeResponse setActive(UUID id, boolean active) {
        Employee employee = findEmployee(id);
        employee.setActive(active);
        return AdminEmployeeResponse.from(employee);
    }

    private void apply(Employee employee, EmployeeRequest request) {
        String firstName = trim(request.getFirstName());
        String lastName = trim(request.getLastName());
        if (firstName.isEmpty() || lastName.isEmpty()) {
            throw new BusinessException("Ad ve soyad zorunludur.");
        }
        if (request.getServiceIds() == null || request.getServiceIds().isEmpty()) {
            throw new BusinessException("Çalışana en az bir hizmet seçilmelidir.");
        }
        List<Service> services = serviceRepository.findAllById(request.getServiceIds());
        if (services.size() != new HashSet<>(request.getServiceIds()).size()) {
            throw new NotFoundException("Seçilen hizmetlerden biri bulunamadı.");
        }
        employee.setFirstName(firstName);
        employee.setLastName(lastName);
        employee.setPhone(request.getPhone() == null || request.getPhone().isBlank()
                ? null : PhoneUtils.normalize(request.getPhone()));
        employee.setServices(new HashSet<>(services));
        employee.getWeeklyOffDays().clear();
        if (request.getWeeklyOffDays() != null) {
            employee.getWeeklyOffDays().addAll(request.getWeeklyOffDays());
        }
    }

    // --- MOLALAR ---

    @Transactional(readOnly = true)
    public List<BreakResponse> listBreaks(UUID employeeId) {
        findEmployee(employeeId);
        return breakRepository.findCurrent(employeeId, LocalDate.now()).stream()
                .map(BreakResponse::from)
                .toList();
    }

    @Transactional
    public BreakResponse addBreak(UUID employeeId, BreakRequest request) {
        Employee employee = findEmployee(employeeId);
        LocalTime start = request.getStartTime();
        LocalTime end = request.getEndTime();
        if (start == null || end == null || !start.isBefore(end)) {
            throw new BusinessException("Mola başlangıcı bitişten önce olmalıdır.");
        }
        if (request.getBreakDate() != null && request.getDayOfWeek() != null) {
            throw new BusinessException("Mola ya belirli bir tarihe ya da haftanın bir gününe tanımlanabilir.");
        }
        if (request.getBreakDate() != null && request.getBreakDate().isBefore(LocalDate.now())) {
            throw new BusinessException("Geçmiş bir tarihe mola eklenemez.");
        }
        EmployeeBreak saved = breakRepository.save(EmployeeBreak.builder()
                .employee(employee)
                .breakDate(request.getBreakDate())
                .dayOfWeek(request.getDayOfWeek())
                .startTime(start)
                .endTime(end)
                .reason(trimToNull(request.getReason()))
                .build());
        return BreakResponse.from(saved);
    }

    @Transactional
    public void deleteBreak(UUID breakId) {
        if (!breakRepository.existsById(breakId)) {
            throw new NotFoundException("Mola bulunamadı.");
        }
        breakRepository.deleteById(breakId);
    }

    // --- İZİNLER ---

    @Transactional(readOnly = true)
    public List<LeaveResponse> listLeaves(UUID employeeId) {
        findEmployee(employeeId);
        return leaveRepository.findByEmployeeIdAndEndDateGreaterThanEqualOrderByStartDateAsc(employeeId, LocalDate.now())
                .stream()
                .map(LeaveResponse::from)
                .toList();
    }

    @Transactional
    public LeaveResponse addLeave(UUID employeeId, LeaveRequest request) {
        Employee employee = findEmployee(employeeId);
        LocalDate start = request.getStartDate();
        LocalDate end = request.getEndDate() == null ? start : request.getEndDate();
        if (start == null || end.isBefore(start)) {
            throw new BusinessException("İzin başlangıç tarihi bitişten sonra olamaz.");
        }
        if (end.isBefore(LocalDate.now())) {
            throw new BusinessException("Geçmiş tarihlere izin eklenemez.");
        }
        // Müşterisi habersiz kalmasın: izin günlerindeki aktif randevular önce iptal edilmeli
        long conflicts = appointmentRepository.countByEmployeeIdAndStatusNotAndStartTimeBetween(
                employeeId, AppointmentStatus.CANCELLED, start.atStartOfDay(), end.atTime(LocalTime.MAX));
        if (conflicts > 0) {
            throw new BusinessException("Bu tarihlerde " + conflicts + " aktif randevu var. "
                    + "Önce Randevular sekmesinden iptal edin (müşterilere SMS ile bildirilir).");
        }
        EmployeeLeave saved = leaveRepository.save(EmployeeLeave.builder()
                .employee(employee)
                .startDate(start)
                .endDate(end)
                .reason(trimToNull(request.getReason()))
                .build());
        return LeaveResponse.from(saved);
    }

    @Transactional
    public void deleteLeave(UUID leaveId) {
        if (!leaveRepository.existsById(leaveId)) {
            throw new NotFoundException("İzin bulunamadı.");
        }
        leaveRepository.deleteById(leaveId);
    }

    private Employee findEmployee(UUID id) {
        return employeeRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Çalışan bulunamadı."));
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimToNull(String value) {
        String trimmed = trim(value);
        return trimmed.isEmpty() ? null : trimmed;
    }
}
