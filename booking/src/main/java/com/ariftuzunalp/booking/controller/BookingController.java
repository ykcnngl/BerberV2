package com.ariftuzunalp.booking.controller;

import com.ariftuzunalp.booking.dto.AppointmentRequest;
import com.ariftuzunalp.booking.dto.AppointmentResponse;
import com.ariftuzunalp.booking.dto.EmployeeResponse;
import com.ariftuzunalp.booking.dto.ServiceResponse;
import com.ariftuzunalp.booking.service.BookingService;
import com.ariftuzunalp.booking.service.VerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/booking")
@RequiredArgsConstructor
public class BookingController {

    // SMS ile doğrulanmış müşterinin oturum anahtarı (bkz. VerificationController)
    private static final String CUSTOMER_TOKEN_HEADER = "X-Customer-Token";

    private final BookingService bookingService;
    private final VerificationService verificationService;

    @GetMapping("/employees")
    public ResponseEntity<List<EmployeeResponse>> getEmployees() {
        return ResponseEntity.ok(bookingService.getActiveEmployees());
    }

    @GetMapping("/services")
    public ResponseEntity<List<ServiceResponse>> getServices() {
        return ResponseEntity.ok(bookingService.getActiveServices());
    }

    @GetMapping("/available-slots")
    public ResponseEntity<List<LocalTime>> getAvailableSlots(
            @RequestParam UUID employeeId,
            @RequestParam UUID serviceId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        
        List<LocalTime> availableSlots = bookingService.getAvailableSlots(employeeId, serviceId, date);
        return ResponseEntity.ok(availableSlots);
    }

    @PostMapping("/appointments")
    public ResponseEntity<Map<String, String>> createAppointment(
            @RequestHeader(CUSTOMER_TOKEN_HEADER) String token,
            @RequestBody AppointmentRequest request) {
        String phone = verificationService.getVerifiedPhone(token);
        bookingService.createAppointment(request, phone);
        return ResponseEntity.ok(Map.of("message", "Randevu başarıyla oluşturuldu."));
    }

    @GetMapping("/appointments")
    public ResponseEntity<List<AppointmentResponse>> getCustomerAppointments(
            @RequestHeader(CUSTOMER_TOKEN_HEADER) String token) {
        String phone = verificationService.getVerifiedPhone(token);
        return ResponseEntity.ok(bookingService.getCustomerAppointments(phone));
    }

    @PatchMapping("/appointments/{id}/cancel")
    public ResponseEntity<Map<String, String>> cancelAppointment(
            @RequestHeader(CUSTOMER_TOKEN_HEADER) String token,
            @PathVariable UUID id) {
        String phone = verificationService.getVerifiedPhone(token);
        bookingService.cancelAppointmentAsCustomer(id, phone);
        return ResponseEntity.ok(Map.of("message", "Randevunuz başarıyla iptal edildi."));
    }
}
