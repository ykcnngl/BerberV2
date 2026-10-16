package com.ariftuzunalp.booking.controller;

import com.ariftuzunalp.booking.dto.AdminEmployeeResponse;
import com.ariftuzunalp.booking.dto.AdminLoginRequest;
import com.ariftuzunalp.booking.dto.AdminServiceResponse;
import com.ariftuzunalp.booking.dto.AppointmentResponse;
import com.ariftuzunalp.booking.dto.BreakRequest;
import com.ariftuzunalp.booking.dto.BreakResponse;
import com.ariftuzunalp.booking.dto.EmployeeRequest;
import com.ariftuzunalp.booking.dto.LeaveRequest;
import com.ariftuzunalp.booking.dto.LeaveResponse;
import com.ariftuzunalp.booking.dto.ReportResponse;
import com.ariftuzunalp.booking.dto.ServiceRequest;
import com.ariftuzunalp.booking.service.AdminAuthService;
import com.ariftuzunalp.booking.service.BookingService;
import com.ariftuzunalp.booking.service.EmployeeAdminService;
import com.ariftuzunalp.booking.service.ReportService;
import com.ariftuzunalp.booking.service.ServiceAdminService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// Yetki kontrolü AdminAuthInterceptor'da yapılır (X-Admin-Password başlığı, /login hariç)
@RestController
@RequestMapping("/api/v1/booking/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminAuthService adminAuthService;
    private final BookingService bookingService;
    private final EmployeeAdminService employeeAdminService;
    private final ServiceAdminService serviceAdminService;
    private final ReportService reportService;

    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody AdminLoginRequest request) {
        adminAuthService.verify(request.getPassword());
        return ResponseEntity.ok(Map.of("message", "Giriş başarılı."));
    }

    // --- RANDEVULAR ---

    @GetMapping("/appointments")
    public ResponseEntity<List<AppointmentResponse>> getAppointments(
            @RequestParam UUID employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(bookingService.getEmployeeAppointments(employeeId, date));
    }

    @PatchMapping("/appointments/{id}/cancel")
    public ResponseEntity<Map<String, String>> cancelAppointment(@PathVariable UUID id) {
        bookingService.cancelAppointmentAsAdmin(id);
        return ResponseEntity.ok(Map.of("message", "Randevu iptal edildi. Müşteriye SMS ile bildirildi."));
    }

    @PatchMapping("/appointments/{id}/no-show")
    public ResponseEntity<AppointmentResponse> setNoShow(@PathVariable UUID id,
                                                       @RequestBody Map<String, Boolean> body) {
        return ResponseEntity.ok(bookingService.setNoShow(id, Boolean.TRUE.equals(body.get("noShow"))));
    }

    // --- RAPOR (ciro, çalışan ve hizmet bazında işlem sayıları) ---

    @GetMapping("/report")
    public ResponseEntity<ReportResponse> getReport(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok(reportService.getReport(from, to));
    }

    // --- ÇALIŞANLAR ---

    @GetMapping("/employees")
    public ResponseEntity<List<AdminEmployeeResponse>> getEmployees() {
        return ResponseEntity.ok(employeeAdminService.listEmployees());
    }

    @PostMapping("/employees")
    public ResponseEntity<AdminEmployeeResponse> createEmployee(@RequestBody EmployeeRequest request) {
        return ResponseEntity.ok(employeeAdminService.createEmployee(request));
    }

    @PutMapping("/employees/{id}")
    public ResponseEntity<AdminEmployeeResponse> updateEmployee(@PathVariable UUID id,
                                                                @RequestBody EmployeeRequest request) {
        return ResponseEntity.ok(employeeAdminService.updateEmployee(id, request));
    }

    @PatchMapping("/employees/{id}/active")
    public ResponseEntity<AdminEmployeeResponse> setEmployeeActive(@PathVariable UUID id,
                                                                   @RequestBody Map<String, Boolean> body) {
        return ResponseEntity.ok(employeeAdminService.setActive(id, Boolean.TRUE.equals(body.get("active"))));
    }

    // --- HİZMETLER ---

    @GetMapping("/services")
    public ResponseEntity<List<AdminServiceResponse>> getServices() {
        return ResponseEntity.ok(serviceAdminService.listServices());
    }

    @PostMapping("/services")
    public ResponseEntity<AdminServiceResponse> createService(@RequestBody ServiceRequest request) {
        return ResponseEntity.ok(serviceAdminService.createService(request));
    }

    @PutMapping("/services/{id}")
    public ResponseEntity<AdminServiceResponse> updateService(@PathVariable UUID id,
                                                              @RequestBody ServiceRequest request) {
        return ResponseEntity.ok(serviceAdminService.updateService(id, request));
    }

    @PatchMapping("/services/{id}/active")
    public ResponseEntity<AdminServiceResponse> setServiceActive(@PathVariable UUID id,
                                                                 @RequestBody Map<String, Boolean> body) {
        return ResponseEntity.ok(serviceAdminService.setActive(id, Boolean.TRUE.equals(body.get("active"))));
    }

    @PutMapping("/services/{id}/employees")
    public ResponseEntity<Map<String, String>> setServiceProviders(@PathVariable UUID id,
                                                                   @RequestBody Map<String, List<UUID>> body) {
        serviceAdminService.setProviders(id, body.get("employeeIds"));
        return ResponseEntity.ok(Map.of("message", "Hizmeti veren ekip güncellendi."));
    }

    // --- MOLALAR ---

    @GetMapping("/employees/{id}/breaks")
    public ResponseEntity<List<BreakResponse>> getBreaks(@PathVariable UUID id) {
        return ResponseEntity.ok(employeeAdminService.listBreaks(id));
    }

    @PostMapping("/employees/{id}/breaks")
    public ResponseEntity<BreakResponse> addBreak(@PathVariable UUID id, @RequestBody BreakRequest request) {
        return ResponseEntity.ok(employeeAdminService.addBreak(id, request));
    }

    @DeleteMapping("/breaks/{breakId}")
    public ResponseEntity<Map<String, String>> deleteBreak(@PathVariable UUID breakId) {
        employeeAdminService.deleteBreak(breakId);
        return ResponseEntity.ok(Map.of("message", "Mola silindi."));
    }

    // --- İZİNLER ---

    @GetMapping("/employees/{id}/leaves")
    public ResponseEntity<List<LeaveResponse>> getLeaves(@PathVariable UUID id) {
        return ResponseEntity.ok(employeeAdminService.listLeaves(id));
    }

    @PostMapping("/employees/{id}/leaves")
    public ResponseEntity<LeaveResponse> addLeave(@PathVariable UUID id, @RequestBody LeaveRequest request) {
        return ResponseEntity.ok(employeeAdminService.addLeave(id, request));
    }

    @DeleteMapping("/leaves/{leaveId}")
    public ResponseEntity<Map<String, String>> deleteLeave(@PathVariable UUID leaveId) {
        employeeAdminService.deleteLeave(leaveId);
        return ResponseEntity.ok(Map.of("message", "İzin silindi."));
    }
}
