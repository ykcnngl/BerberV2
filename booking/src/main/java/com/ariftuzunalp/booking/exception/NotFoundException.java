package com.ariftuzunalp.booking.exception;

// 404 - İstenen kayıt (ekip üyesi, hizmet, randevu) bulunamadı
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) {
        super(message);
    }
}
