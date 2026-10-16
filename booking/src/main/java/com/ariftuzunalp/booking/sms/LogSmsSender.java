package com.ariftuzunalp.booking.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

// GELİŞTİRME İÇİN: SMS göndermez, mesajı sunucu loguna yazar. Canlıda app.sms.provider değiştirilmeli.
@Component
@ConditionalOnProperty(name = "app.sms.provider", havingValue = "log", matchIfMissing = true)
public class LogSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(LogSmsSender.class);

    public LogSmsSender() {
        log.warn("SMS sağlayıcısı 'log' modunda: kodlar gerçek SMS olarak GÖNDERİLMEZ, sadece loga yazılır.");
    }

    @Override
    public void sendOtp(String phone, String message) {
        log.info("[SMS -> {}] {}", phone, message);
    }

    @Override
    public void sendNotification(String phone, String message) {
        log.info("[SMS -> {}] {}", phone, message);
    }
}
