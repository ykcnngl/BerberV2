package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.entity.Appointment;
import com.ariftuzunalp.booking.entity.Customer;
import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.entity.EmployeeBreak;
import com.ariftuzunalp.booking.entity.Service;
import com.ariftuzunalp.booking.entity.AppointmentStatus;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.exception.NotFoundException;
import com.ariftuzunalp.booking.exception.UnauthorizedException;
import com.ariftuzunalp.booking.repository.AppointmentRepository;
import com.ariftuzunalp.booking.repository.CustomerRepository;
import com.ariftuzunalp.booking.repository.EmployeeBreakRepository;
import com.ariftuzunalp.booking.repository.EmployeeLeaveRepository;
import com.ariftuzunalp.booking.repository.EmployeeRepository;
import com.ariftuzunalp.booking.repository.ServiceRepository;
import com.ariftuzunalp.booking.dto.AppointmentRequest;
import com.ariftuzunalp.booking.dto.AppointmentResponse;
import com.ariftuzunalp.booking.dto.EmployeeResponse;
import com.ariftuzunalp.booking.dto.ServiceResponse;
import com.ariftuzunalp.booking.notification.AppointmentCancelledByAdminEvent;
import com.ariftuzunalp.booking.notification.AppointmentCreatedEvent;
import com.ariftuzunalp.booking.util.PhoneUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class BookingService {

    private final AppointmentRepository appointmentRepository;
    private final EmployeeBreakRepository employeeBreakRepository;
    private final EmployeeLeaveRepository employeeLeaveRepository;
    private final ServiceRepository serviceRepository;
    private final EmployeeRepository employeeRepository;
    private final CustomerRepository customerRepository;
    private final ApplicationEventPublisher eventPublisher;

    private static final LocalTime SHOP_OPEN_TIME = LocalTime.of(9, 0);
    private static final LocalTime SHOP_CLOSE_TIME = LocalTime.of(20, 0);
    private static final int CUSTOMER_HISTORY_WEEKS = 1;

    @Transactional(readOnly = true)
    public List<EmployeeResponse> getActiveEmployees() {
        return employeeRepository.findAll().stream()
                .filter(Employee::isActive)
                .map(EmployeeResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ServiceResponse> getActiveServices() {
        return serviceRepository.findAll().stream()
                .filter(Service::isActive)
                .sorted(ServiceAdminService.BY_NAME)
                .map(ServiceResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<LocalTime> getAvailableSlots(UUID employeeId, UUID serviceId, LocalDate date) {

        // 1. GÜVENLİK: Eğer istenilen gün dünden kalmaysa, direkt boş liste dön.
        if (date.isBefore(LocalDate.now())) {
            return new ArrayList<>();
        }

        Employee employee = employeeRepository.findById(employeeId)
                .orElseThrow(() -> new NotFoundException("Ekip üyesi bulunamadı."));
        Service requestedService = serviceRepository.findById(serviceId)
                .orElseThrow(() -> new NotFoundException("Hizmet bulunamadı."));
        ensureEmployeeProvidesService(employee, requestedService);

        // Haftalık izin günü veya izinli olduğu tarih: hiç saat gösterme
        if (isEmployeeOff(employee, date)) {
            return new ArrayList<>();
        }

        int totalRequiredMinutes = requestedService.getDurationMinutes() + requestedService.getBufferMinutes();

        LocalDateTime startOfDay = date.atStartOfDay();
        LocalDateTime endOfDay = date.atTime(LocalTime.MAX);
        List<Appointment> existingAppointments = appointmentRepository
                .findByEmployeeIdAndStartTimeBetweenOrderByStartTimeAsc(employeeId, startOfDay, endOfDay);

        List<EmployeeBreak> employeeBreaks = employeeBreakRepository
                .findApplicable(employeeId, date, date.getDayOfWeek());

        List<LocalTime> availableSlots = new ArrayList<>();
        LocalTime currentTime = SHOP_OPEN_TIME;

        while (!currentTime.plusMinutes(totalRequiredMinutes).isAfter(SHOP_CLOSE_TIME)) {

            LocalDateTime proposedStartTime = date.atTime(currentTime);

            // 2. GÜVENLİK: Randevu günü bugünse, geçmiş saatleri listeye koyma (örn saat 14:00 ise, 13:30'u gösterme)
            if (proposedStartTime.isBefore(LocalDateTime.now())) {
                currentTime = currentTime.plusMinutes(30);
                continue;
            }

            LocalDateTime proposedEndTime = proposedStartTime.plusMinutes(totalRequiredMinutes);
            boolean isOverlapping = checkOverlap(proposedStartTime, proposedEndTime, existingAppointments, employeeBreaks);

            if (!isOverlapping) {
                availableSlots.add(currentTime);
            }

            currentTime = currentTime.plusMinutes(30);
        }

        return availableSlots;
    }

    private boolean isEmployeeOff(Employee employee, LocalDate date) {
        return employee.getWeeklyOffDays().contains(date.getDayOfWeek())
                || employeeLeaveRepository.existsByEmployeeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
                        employee.getId(), date, date);
    }

    private boolean checkOverlap(LocalDateTime start, LocalDateTime end,
                                 List<Appointment> appointments, List<EmployeeBreak> breaks) {
        for (Appointment app : appointments) {
            if (app.getStatus() != AppointmentStatus.CANCELLED) {
                if (start.isBefore(app.getEndTime()) && end.isAfter(app.getStartTime())) {
                    return true;
                }
            }
        }
        for (EmployeeBreak b : breaks) {
            // Tekrarlayan molalarda tarih yoktur; randevunun günü esas alınır
            LocalDateTime breakStart = start.toLocalDate().atTime(b.getStartTime());
            LocalDateTime breakEnd = start.toLocalDate().atTime(b.getEndTime());
            if (start.isBefore(breakEnd) && end.isAfter(breakStart)) {
                return true;
            }
        }
        return false;
    }

    private void ensureEmployeeProvidesService(Employee employee, Service service) {
        if (!employee.isActive()) {
            throw new BusinessException("Seçilen ekip üyesi şu anda randevu kabul etmiyor.");
        }
        if (!service.isActive()) {
            throw new BusinessException("Bu hizmet şu anda verilmiyor.");
        }
        boolean provides = employee.getServices() != null && employee.getServices().stream()
                .anyMatch(s -> s.getId().equals(service.getId()));
        if (!provides) {
            throw new BusinessException("Seçilen ekip üyesi bu hizmeti vermiyor.");
        }
    }

    // verifiedPhone: SMS koduyla doğrulanmış numara (bkz. VerificationService)
    @Transactional
    public void createAppointment(AppointmentRequest request, String verifiedPhone) {

        if (request.getEmployeeId() == null || request.getServiceId() == null || request.getStartTime() == null) {
            throw new BusinessException("Ekip üyesi, hizmet ve saat seçimi zorunludur.");
        }
        String customerName = request.getCustomerFullName() == null ? "" : request.getCustomerFullName().trim();
        if (customerName.length() < 2) {
            throw new BusinessException("Lütfen adınızı ve soyadınızı girin.");
        }
        String phone = PhoneUtils.normalize(verifiedPhone);
        if (request.getCustomerPhone() != null && !request.getCustomerPhone().isBlank()
                && !PhoneUtils.normalize(request.getCustomerPhone()).equals(phone)) {
            throw new UnauthorizedException("Randevu yalnızca doğrulanan telefon numarasıyla alınabilir.");
        }

        // 3. GÜVENLİK: API üzerinden Postman ile zorla geçmişe kayıt atılmaya çalışılırsa reddet
        if (request.getStartTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("Geçmiş bir tarihe veya saate randevu alamazsınız.");
        }

        Employee employee = employeeRepository.findByIdForUpdate(request.getEmployeeId())
                .orElseThrow(() -> new NotFoundException("Ekip üyesi bulunamadı."));

        Service service = serviceRepository.findById(request.getServiceId())
                .orElseThrow(() -> new NotFoundException("Hizmet bulunamadı."));
        ensureEmployeeProvidesService(employee, service);

        LocalDateTime endTime = request.getStartTime()
                .plusMinutes(service.getDurationMinutes() + service.getBufferMinutes());

        // 4. GÜVENLİK: Çalışma saatleri dışına randevu atılmasını engelle
        LocalTime startClock = request.getStartTime().toLocalTime();
        if (startClock.isBefore(SHOP_OPEN_TIME)
                || !endTime.toLocalDate().equals(request.getStartTime().toLocalDate())
                || endTime.toLocalTime().isAfter(SHOP_CLOSE_TIME)) {
            throw new BusinessException("Seçilen saat çalışma saatleri dışında.");
        }
        if (isEmployeeOff(employee, request.getStartTime().toLocalDate())) {
            throw new BusinessException("Seçilen ekip üyesi bu tarihte izinli.");
        }

        LocalDateTime startOfDay = request.getStartTime().toLocalDate().atStartOfDay();
        LocalDateTime endOfDay = request.getStartTime().toLocalDate().atTime(LocalTime.MAX);

        List<Appointment> existingAppointments = appointmentRepository
                .findByEmployeeIdAndStartTimeBetweenOrderByStartTimeAsc(employee.getId(), startOfDay, endOfDay);
        LocalDate appointmentDate = request.getStartTime().toLocalDate();
        List<EmployeeBreak> employeeBreaks = employeeBreakRepository
                .findApplicable(employee.getId(), appointmentDate, appointmentDate.getDayOfWeek());

        boolean isOverlapping = checkOverlap(request.getStartTime(), endTime, existingAppointments, employeeBreaks);
        if (isOverlapping) {
            throw new BusinessException("Üzgünüz, bu saat dilimi az önce başka bir müşteri tarafından alındı.");
        }

        Customer customer = customerRepository.findByPhone(phone)
                .orElseGet(() -> {
                    Customer newCustomer = Customer.builder()
                            .fullName(customerName)
                            .phone(phone)
                            .isBlacklisted(false)
                            .build();
                    return customerRepository.save(newCustomer);
                });

        Appointment appointment = Appointment.builder()
                .customer(customer)
                .employee(employee)
                .service(service)
                .startTime(request.getStartTime())
                .endTime(endTime)
                .price(service.getPrice())
                .status(AppointmentStatus.CONFIRMED)
                .build();

        appointmentRepository.save(appointment);
        eventPublisher.publishEvent(new AppointmentCreatedEvent(
                customerName,
                customer.getPhone(),
                service.getName(),
                employee.getFirstName() + " " + employee.getLastName(),
                appointment.getStartTime()));
    }

    // Müşteri, üzerinden bir haftadan fazla geçmiş randevularını görmez (kayıtlar silinmez, raporda kalır)
    @Transactional(readOnly = true)
    public List<AppointmentResponse> getCustomerAppointments(String phone) {
        return appointmentRepository
                .findByCustomerPhoneAndStartTimeGreaterThanEqualOrderByStartTimeDesc(
                        PhoneUtils.normalize(phone), LocalDateTime.now().minusWeeks(CUSTOMER_HISTORY_WEEKS))
                .stream()
                .map(AppointmentResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<AppointmentResponse> getEmployeeAppointments(UUID employeeId, LocalDate date) {
        return appointmentRepository
                .findByEmployeeIdAndStartTimeBetweenOrderByStartTimeAsc(
                        employeeId, date.atStartOfDay(), date.atTime(LocalTime.MAX))
                .stream()
                .map(AppointmentResponse::from)
                .toList();
    }

    // Müşteri iptali: randevu, SMS ile doğrulanmış telefon numarasına ait olmalı
    @Transactional
    public void cancelAppointmentAsCustomer(UUID appointmentId, String phone) {
        Appointment appointment = findAppointment(appointmentId);
        if (!appointment.getCustomer().getPhone().equals(PhoneUtils.normalize(phone))) {
            throw new UnauthorizedException("Bu randevu size ait değil.");
        }
        cancel(appointment);
    }

    // Yönetici iptali: sahiplik kontrolü yok (yetki controller'da doğrulanır). Müşteriye SMS ile bildirilir.
    @Transactional
    public void cancelAppointmentAsAdmin(UUID appointmentId) {
        Appointment appointment = findAppointment(appointmentId);
        cancel(appointment);
        eventPublisher.publishEvent(new AppointmentCancelledByAdminEvent(
                appointment.getCustomer().getFullName(),
                appointment.getCustomer().getPhone(),
                appointment.getService().getName(),
                appointment.getEmployee().getFirstName() + " " + appointment.getEmployee().getLastName(),
                appointment.getStartTime()));
    }

    // Yönetici, saati geçmiş randevuyu "gelmedi" olarak işaretler (veya geri alır); bu randevular ciroya sayılmaz
    @Transactional
    public AppointmentResponse setNoShow(UUID appointmentId, boolean noShow) {
        Appointment appointment = findAppointment(appointmentId);
        if (appointment.getStatus() == AppointmentStatus.CANCELLED) {
            throw new BusinessException("İptal edilmiş randevu işaretlenemez.");
        }
        if (!appointment.getStartTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("Saati gelmemiş randevu \"gelmedi\" olarak işaretlenemez.");
        }
        appointment.setStatus(noShow ? AppointmentStatus.NO_SHOW : AppointmentStatus.CONFIRMED);
        return AppointmentResponse.from(appointment);
    }

    private Appointment findAppointment(UUID appointmentId) {
        return appointmentRepository.findById(appointmentId)
                .orElseThrow(() -> new NotFoundException("Randevu bulunamadı."));
    }

    private void cancel(Appointment appointment) {
        if (appointment.getStatus() == AppointmentStatus.CANCELLED) {
            throw new BusinessException("Bu randevu zaten iptal edilmiş.");
        }
        if (appointment.getStartTime().isBefore(LocalDateTime.now())) {
            throw new BusinessException("Geçmiş randevular iptal edilemez.");
        }

        appointment.setStatus(AppointmentStatus.CANCELLED);
        appointmentRepository.save(appointment);
    }
}
