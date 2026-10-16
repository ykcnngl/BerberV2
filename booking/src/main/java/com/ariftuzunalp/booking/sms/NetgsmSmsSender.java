package com.ariftuzunalp.booking.sms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Netgsm entegrasyonu. Hesapta onaylı gönderici başlığı olmalıdır.
// - OTP (doğrulama kodu): "OTP SMS Paketi" gerekir, mesajda Türkçe karakter kullanılamaz.
// - Bilgilendirme (randevu onayı/iptali): normal SMS paketi. Tek parça (160 karakter) gitmesi için
//   mesajlar Türkçe karaktersiz yazılır (bkz. SmsText).
@Component
@ConditionalOnProperty(name = "app.sms.provider", havingValue = "netgsm")
public class NetgsmSmsSender implements SmsSender {

    private static final Logger log = LoggerFactory.getLogger(NetgsmSmsSender.class);
    private static final Pattern OTP_CODE_PATTERN = Pattern.compile("<code>\\s*(\\d+)\\s*</code>");

    private static final Map<String, String> OTP_ERRORS = Map.of(
            "20", "Mesaj metni veya uzunluğu hatalı",
            "30", "Geçersiz kullanıcı adı/şifre, API erişim izni yok veya IP kısıtlaması",
            "40", "Gönderici başlığı tanımlı değil",
            "41", "Gönderici başlığı tanımlı değil",
            "50", "Gönderilen numara hatalı",
            "60", "Hesapta OTP SMS paketi tanımlı değil",
            "70", "Eksik veya hatalı parametre",
            "80", "Gönderim sınırı aşıldı (dakikada 100)",
            "100", "Netgsm sistem hatası");

    // Normal SMS yanıtı "00 <görev id>" biçimindedir; 00/01/02 başarılıdır
    private static final Set<String> SMS_SUCCESS = Set.of("00", "01", "02");
    private static final Map<String, String> SMS_ERRORS = Map.of(
            "20", "Mesaj metni veya uzunluğu hatalı",
            "30", "Geçersiz kullanıcı adı/şifre, API erişim izni yok veya IP kısıtlaması",
            "40", "Gönderici başlığı tanımlı değil",
            "50", "Abone hesabıyla İYS kontrollü gönderim yapılamıyor",
            "51", "Aboneliğe tanımlı İYS marka bilgisi yok",
            "70", "Eksik veya hatalı parametre",
            "80", "Gönderim sınırı aşıldı",
            "85", "Aynı numaraya 1 dakikada 20'den fazla gönderim");

    private final URI otpUrl;
    private final URI smsUrl;
    private final String usercode;
    private final String password;
    private final String msgHeader;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public NetgsmSmsSender(@Value("${app.sms.netgsm.usercode:}") String usercode,
                           @Value("${app.sms.netgsm.password:}") String password,
                           @Value("${app.sms.netgsm.header:}") String msgHeader,
                           @Value("${app.sms.netgsm.otp-url:https://api.netgsm.com.tr/sms/send/otp}") String otpUrl,
                           @Value("${app.sms.netgsm.sms-url:https://api.netgsm.com.tr/sms/send/xml}") String smsUrl) {
        if (usercode.isBlank() || password.isBlank() || msgHeader.isBlank()) {
            throw new IllegalStateException(
                    "Netgsm için NETGSM_USERCODE, NETGSM_PASSWORD ve NETGSM_HEADER booking/.env dosyasında tanımlanmalı.");
        }
        this.otpUrl = URI.create(otpUrl);
        this.smsUrl = URI.create(smsUrl);
        this.usercode = usercode;
        this.password = password;
        this.msgHeader = msgHeader;
    }

    @Override
    public void sendOtp(String phone, String message) {
        String xml = "<?xml version=\"1.0\"?>"
                + "<mainbody>"
                + "<header>"
                + "<usercode>" + escape(usercode) + "</usercode>"
                + "<password>" + escape(password) + "</password>"
                + "<msgheader>" + escape(msgHeader) + "</msgheader>"
                + "</header>"
                + "<body>"
                + "<msg>" + escape(message) + "</msg>"
                + "<no>" + escape(toNetgsmNumber(phone)) + "</no>"
                + "</body>"
                + "</mainbody>";

        String body = post(otpUrl, xml);
        Matcher matcher = OTP_CODE_PATTERN.matcher(body);
        String code = matcher.find() ? matcher.group(1) : null;
        if (code == null || OTP_ERRORS.containsKey(code)) {
            fail("OTP", code == null ? "Beklenmeyen yanıt: " + body : OTP_ERRORS.get(code) + " (kod " + code + ")");
        }
        log.info("Netgsm OTP gönderildi -> {} (kod {})", toNetgsmNumber(phone), code);
    }

    @Override
    public void sendNotification(String phone, String message) {
        // filter=0: ticari olmayan bilgilendirme mesajı (İYS kontrolü uygulanmaz)
        String xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
                + "<mainbody>"
                + "<header>"
                + "<company>Netgsm</company>"
                + "<usercode>" + escape(usercode) + "</usercode>"
                + "<password>" + escape(password) + "</password>"
                + "<type>1:n</type>"
                + "<msgheader>" + escape(msgHeader) + "</msgheader>"
                + "<filter>0</filter>"
                + "</header>"
                + "<body>"
                + "<msg>" + escape(message) + "</msg>"
                + "<no>" + escape(toNetgsmNumber(phone)) + "</no>"
                + "</body>"
                + "</mainbody>";

        String body = post(smsUrl, xml).trim();
        String code = body.isEmpty() ? "" : body.split("\\s+")[0];
        if (!SMS_SUCCESS.contains(code)) {
            fail("SMS", SMS_ERRORS.getOrDefault(code, "Beklenmeyen yanıt: " + body) + " (kod " + code + ")");
        }
        log.info("Netgsm SMS gönderildi -> {} (yanıt {})", toNetgsmNumber(phone), body);
    }

    // Netgsm numarayı başında 0 olmadan 10 hane bekler: 905554443322 -> 5554443322
    private static String toNetgsmNumber(String phone) {
        return phone.startsWith("90") ? phone.substring(2) : phone;
    }

    private String post(URI url, String xml) {
        HttpRequest request = HttpRequest.newBuilder(url)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "text/xml; charset=UTF-8")
                .POST(HttpRequest.BodyPublishers.ofString(xml, StandardCharsets.UTF_8))
                .build();
        try {
            return httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8)).body();
        } catch (IOException e) {
            throw new SmsException("Netgsm'e bağlanılamadı", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SmsException("Netgsm isteği kesildi", e);
        }
    }

    private static void fail(String type, String reason) {
        log.error("Netgsm {} gönderilemedi: {}", type, reason);
        throw new SmsException("Netgsm " + type + " gönderilemedi: " + reason);
    }

    private static String escape(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&apos;");
    }
}
