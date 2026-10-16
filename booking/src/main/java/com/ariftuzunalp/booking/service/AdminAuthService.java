package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.exception.UnauthorizedException;
import org.springframework.beans.factory.annotation.Value;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@org.springframework.stereotype.Service
public class AdminAuthService {

    private static final int MIN_PASSWORD_LENGTH = 12;

    private final String adminPassword;

    public AdminAuthService(@Value("${app.admin.password}") String adminPassword) {
        // Zayıf veya eksik şifreyle uygulamanın açılmasına izin verme
        if (adminPassword == null || adminPassword.isBlank()) {
            throw new IllegalStateException(
                    "ADMIN_PASSWORD tanımlı değil. booking/.env dosyasına veya ortam değişkenine ekleyin.");
        }
        if (adminPassword.length() < MIN_PASSWORD_LENGTH || adminPassword.equals("emin123")) {
            throw new IllegalStateException(
                    "ADMIN_PASSWORD en az " + MIN_PASSWORD_LENGTH + " karakter olmalı ve eski varsayılan şifre kullanılamaz.");
        }
        this.adminPassword = adminPassword;
    }

    public void verify(String password) {
        if (password == null || !MessageDigest.isEqual(
                password.getBytes(StandardCharsets.UTF_8),
                adminPassword.getBytes(StandardCharsets.UTF_8))) {
            throw new UnauthorizedException("Hatalı yönetici şifresi.");
        }
    }
}
