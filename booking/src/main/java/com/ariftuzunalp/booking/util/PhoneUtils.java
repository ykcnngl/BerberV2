package com.ariftuzunalp.booking.util;

import com.ariftuzunalp.booking.exception.BusinessException;

public final class PhoneUtils {

    private PhoneUtils() {
    }

    // Veritabanındaki standart format: "05554443322", "+90 555...", "5554443322" -> "0555 444 3322"
    public static String normalize(String phone) {
        String digits = toDigits(phone);
        return digits.substring(0, 4) + " " + digits.substring(4, 7) + " " + digits.substring(7);
    }

    // SMS sağlayıcıları için uluslararası format: "0555 444 3322" -> "905554443322"
    public static String toInternational(String phone) {
        return "9" + toDigits(phone);
    }

    private static String toDigits(String phone) {
        if (phone == null) {
            throw new BusinessException("Telefon numarası zorunludur.");
        }
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("90") && digits.length() == 12) {
            digits = "0" + digits.substring(2);
        } else if (digits.startsWith("5") && digits.length() == 10) {
            digits = "0" + digits;
        }
        if (!digits.matches("05\\d{9}")) {
            throw new BusinessException("Geçerli bir cep telefonu numarası girin (05XX XXX XXXX).");
        }
        return digits;
    }
}
