package com.ariftuzunalp.booking.exception;

// 400 - İş kuralı ihlali (geçmiş tarih, dolu saat, eksik bilgi vb.)
public class BusinessException extends RuntimeException {
    public BusinessException(String message) {
        super(message);
    }
}
