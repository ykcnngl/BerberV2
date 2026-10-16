package com.ariftuzunalp.booking.sms;

// SMS sağlayıcısı (Netgsm vb.) bu arayüzü uygular. phone: uluslararası format, örn. "905554443322"
public interface SmsSender {

    // Doğrulama kodu (OTP). Mesajda Türkçe karakter kullanılmamalı.
    void sendOtp(String phone, String message);

    // Bilgilendirme mesajı (randevu onayı/iptali). Tek parça gitmesi için Türkçe karaktersiz, en fazla 160 karakter.
    void sendNotification(String phone, String message);
}
