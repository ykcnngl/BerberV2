package com.ariftuzunalp.booking.sms;

import java.text.Normalizer;

// Tek parça SMS için metin yardımcıları. Türkçe karakterli SMS'ler 70 karakterde bölünür ve her parça ayrı
// ücretlendirilir; Türkçe karaktersiz (GSM 7-bit) bir SMS ise 160 karaktere kadar tek parçadır.
public final class SmsText {

    public static final int SINGLE_PART_LENGTH = 160;

    private SmsText() {
    }

    // "Saç Kesimi" -> "Sac Kesimi". GSM temel alfabesinde tek karakter sayılmayanlar atılır.
    public static String ascii(String text) {
        if (text == null) {
            return "";
        }
        String s = text
                .replace('ç', 'c').replace('Ç', 'C')
                .replace('ğ', 'g').replace('Ğ', 'G')
                .replace('ı', 'i').replace('İ', 'I')
                .replace('ö', 'o').replace('Ö', 'O')
                .replace('ş', 's').replace('Ş', 'S')
                .replace('ü', 'u').replace('Ü', 'U');
        s = Normalizer.normalize(s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return s.replaceAll("[^A-Za-z0-9 .,:;!?'\"()/@&%+*#=_-]", "").replaceAll("\\s+", " ").trim();
    }

    // Zorunlu metnin sonuna ek parçaları sırayla, toplam 160 karakteri aşmadıkça ekler
    public static String fit(String required, String... optional) {
        StringBuilder sb = new StringBuilder(required.length() > SINGLE_PART_LENGTH
                ? required.substring(0, SINGLE_PART_LENGTH) : required);
        for (String part : optional) {
            if (part != null && sb.length() + part.length() <= SINGLE_PART_LENGTH) {
                sb.append(part);
            }
        }
        return sb.toString();
    }
}
