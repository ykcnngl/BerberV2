package com.ariftuzunalp.booking.exception;

// 401 - Yönetici şifresi hatalı veya randevu sahibine ait değil
public class UnauthorizedException extends RuntimeException {
    public UnauthorizedException(String message) {
        super(message);
    }
}
