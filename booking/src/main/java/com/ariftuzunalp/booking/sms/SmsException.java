package com.ariftuzunalp.booking.sms;

// SMS sağlayıcısına ulaşılamadı veya gönderim reddedildi (503 olarak döner)
public class SmsException extends RuntimeException {
    public SmsException(String message) {
        super(message);
    }

    public SmsException(String message, Throwable cause) {
        super(message, cause);
    }
}
