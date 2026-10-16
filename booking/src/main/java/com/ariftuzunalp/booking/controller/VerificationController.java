package com.ariftuzunalp.booking.controller;

import com.ariftuzunalp.booking.dto.VerificationRequest;
import com.ariftuzunalp.booking.dto.VerificationResponse;
import com.ariftuzunalp.booking.service.VerificationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// 1) /request ile telefona kod gönderilir  2) /verify ile kod doğrulanır ve oturum anahtarı alınır
@RestController
@RequestMapping("/api/v1/booking/verification")
@RequiredArgsConstructor
public class VerificationController {

    private final VerificationService verificationService;

    @PostMapping("/request")
    public ResponseEntity<Map<String, String>> requestCode(@RequestBody VerificationRequest request) {
        verificationService.requestCode(request.getPhone());
        return ResponseEntity.ok(Map.of("message", "Doğrulama kodu telefonunuza gönderildi."));
    }

    @PostMapping("/verify")
    public ResponseEntity<VerificationResponse> verifyCode(@RequestBody VerificationRequest request) {
        return ResponseEntity.ok(verificationService.verifyCode(request.getPhone(), request.getCode()));
    }
}
