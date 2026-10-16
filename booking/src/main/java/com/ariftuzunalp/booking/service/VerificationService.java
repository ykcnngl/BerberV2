package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.dto.VerificationResponse;
import com.ariftuzunalp.booking.entity.CustomerSession;
import com.ariftuzunalp.booking.entity.PhoneVerification;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.exception.UnauthorizedException;
import com.ariftuzunalp.booking.repository.CustomerSessionRepository;
import com.ariftuzunalp.booking.repository.PhoneVerificationRepository;
import com.ariftuzunalp.booking.sms.SmsSender;
import com.ariftuzunalp.booking.util.PhoneUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;

// Telefon numarasının sahibine ait olduğunu SMS koduyla doğrular ve kısa süreli oturum açar
@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class VerificationService {

    private static final int CODE_VALID_MINUTES = 5;
    private static final int RESEND_COOLDOWN_SECONDS = 60;
    private static final int MAX_CODES_PER_HOUR = 5;
    private static final int MAX_ATTEMPTS_PER_CODE = 5;
    private static final int SESSION_VALID_MINUTES = 30;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final PhoneVerificationRepository verificationRepository;
    private final CustomerSessionRepository sessionRepository;
    private final SmsSender smsSender;

    @Transactional
    public void requestCode(String rawPhone) {
        String phone = PhoneUtils.normalize(rawPhone);
        LocalDateTime now = LocalDateTime.now();
        verificationRepository.deleteCreatedBefore(now.minusHours(1));

        verificationRepository.findFirstByPhoneOrderByCreatedAtDesc(phone).ifPresent(last -> {
            long waited = Duration.between(last.getCreatedAt(), now).toSeconds();
            if (waited < RESEND_COOLDOWN_SECONDS) {
                throw new BusinessException("Yeni kod istemek için " + (RESEND_COOLDOWN_SECONDS - waited) + " saniye bekleyin.");
            }
        });
        if (verificationRepository.countByPhoneAndCreatedAtAfter(phone, now.minusHours(1)) >= MAX_CODES_PER_HOUR) {
            throw new BusinessException("Çok fazla kod istendi. Lütfen bir saat sonra tekrar deneyin.");
        }

        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        verificationRepository.save(PhoneVerification.builder()
                .phone(phone)
                .codeHash(sha256(code))
                .expiresAt(now.plusMinutes(CODE_VALID_MINUTES))
                .build());

        // Netgsm OTP mesajlarında Türkçe karakter kullanılamaz
        smsSender.sendOtp(PhoneUtils.toInternational(phone),
                "Randevu dogrulama kodunuz: " + code + " (" + CODE_VALID_MINUTES + " dk gecerlidir)");
    }

    // Hatalı denemede deneme sayacının kaydedilmesi için BusinessException'da rollback yapılmaz
    @Transactional(noRollbackFor = BusinessException.class)
    public VerificationResponse verifyCode(String rawPhone, String code) {
        String phone = PhoneUtils.normalize(rawPhone);
        LocalDateTime now = LocalDateTime.now();

        PhoneVerification verification = verificationRepository.findFirstByPhoneOrderByCreatedAtDesc(phone)
                .filter(v -> !v.isUsed() && v.getExpiresAt().isAfter(now))
                .orElseThrow(() -> new BusinessException("Geçerli bir kod bulunamadı. Lütfen yeni kod isteyin."));

        if (verification.getAttempts() >= MAX_ATTEMPTS_PER_CODE) {
            throw new BusinessException("Çok fazla hatalı deneme. Lütfen yeni kod isteyin.");
        }
        verification.setAttempts(verification.getAttempts() + 1);

        if (code == null || !MessageDigest.isEqual(
                sha256(code.trim()).getBytes(StandardCharsets.UTF_8),
                verification.getCodeHash().getBytes(StandardCharsets.UTF_8))) {
            int left = MAX_ATTEMPTS_PER_CODE - verification.getAttempts();
            throw new BusinessException(left > 0
                    ? "Kod hatalı. Kalan deneme hakkı: " + left
                    : "Çok fazla hatalı deneme. Lütfen yeni kod isteyin.");
        }
        verification.setUsed(true);

        sessionRepository.deleteExpired(now);
        byte[] tokenBytes = new byte[32];
        RANDOM.nextBytes(tokenBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(tokenBytes);
        sessionRepository.save(CustomerSession.builder()
                .tokenHash(sha256(token))
                .phone(phone)
                .expiresAt(now.plusMinutes(SESSION_VALID_MINUTES))
                .build());

        return new VerificationResponse(token, SESSION_VALID_MINUTES);
    }

    // Oturum anahtarına ait telefon numarasını döner; geçersiz veya süresi dolmuşsa 401
    @Transactional(readOnly = true)
    public String getVerifiedPhone(String token) {
        if (token == null || token.isBlank()) {
            throw new UnauthorizedException("Lütfen telefon numaranızı doğrulayın.");
        }
        return sessionRepository.findByTokenHash(sha256(token))
                .filter(s -> s.getExpiresAt().isAfter(LocalDateTime.now()))
                .map(CustomerSession::getPhone)
                .orElseThrow(() -> new UnauthorizedException("Oturumunuzun süresi doldu. Lütfen tekrar doğrulayın."));
    }

    private static String sha256(String value) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
