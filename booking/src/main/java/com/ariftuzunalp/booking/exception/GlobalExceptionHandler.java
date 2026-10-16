package com.ariftuzunalp.booking.exception;

import com.ariftuzunalp.booking.sms.SmsException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.Map;

// Tüm hataları frontend'in okuyabileceği { "message": "..." } formatında döner
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NotFoundException ex) {
        return error(HttpStatus.NOT_FOUND, ex.getMessage());
    }

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<Map<String, String>> handleBusiness(BusinessException ex) {
        return error(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, String>> handleUnauthorized(UnauthorizedException ex) {
        return error(HttpStatus.UNAUTHORIZED, ex.getMessage());
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleTooLarge(MaxUploadSizeExceededException ex) {
        return error(HttpStatus.BAD_REQUEST, "Fotoğraf en fazla 10 MB olabilir.");
    }

    @ExceptionHandler(SmsException.class)
    public ResponseEntity<Map<String, String>> handleSms(SmsException ex) {
        log.error("SMS hatası", ex);
        return error(HttpStatus.SERVICE_UNAVAILABLE, "SMS şu anda gönderilemiyor. Lütfen biraz sonra tekrar deneyin.");
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<Map<String, String>> handleMissingHeader(MissingRequestHeaderException ex) {
        String message = "X-Admin-Password".equalsIgnoreCase(ex.getHeaderName())
                ? "Bu işlem için yönetici girişi gerekli."
                : "Lütfen telefon numaranızı doğrulayın.";
        return error(HttpStatus.UNAUTHORIZED, message);
    }

    @ExceptionHandler({
            MissingServletRequestParameterException.class,
            MethodArgumentTypeMismatchException.class,
            HttpMessageNotReadableException.class
    })
    public ResponseEntity<Map<String, String>> handleBadRequest(Exception ex) {
        return error(HttpStatus.BAD_REQUEST, "Geçersiz istek. Lütfen gönderilen bilgileri kontrol edin.");
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleUnexpected(Exception ex) {
        // Spring'in kendi hataları (404 adres yok, 405 yanlış metot vb.) kendi durum kodunu korusun
        if (ex instanceof ErrorResponse errorResponse) {
            HttpStatus status = HttpStatus.valueOf(errorResponse.getStatusCode().value());
            return error(status, status.is4xxClientError() ? "Geçersiz istek." : "Sunucu hatası.");
        }
        log.error("Beklenmeyen hata", ex);
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.");
    }

    private ResponseEntity<Map<String, String>> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
