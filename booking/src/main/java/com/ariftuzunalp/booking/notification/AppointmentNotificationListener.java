package com.ariftuzunalp.booking.notification;

import com.ariftuzunalp.booking.sms.SmsSender;
import com.ariftuzunalp.booking.sms.SmsText;
import com.ariftuzunalp.booking.util.PhoneUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.time.format.DateTimeFormatter;

@Component
public class AppointmentNotificationListener {

    private static final Logger log = LoggerFactory.getLogger(AppointmentNotificationListener.class);
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");

    private final SmsSender smsSender;
    private final String businessName;
    private final String businessPhone;

    public AppointmentNotificationListener(SmsSender smsSender,
                                           @Value("${app.business.name}") String businessName,
                                           @Value("${app.business.phone}") String businessPhone) {
        this.smsSender = smsSender;
        this.businessName = businessName;
        this.businessPhone = businessPhone;
    }

    // Randevu kaydedildikten sonra arka planda çalışır; SMS hatası randevuyu geri almaz, sadece loglanır
    // Örnek: "Randevunuz onaylandi: 14.10.2026 15:30, Sac Kesimi - Emin Ak. Arif Tuzunalp Tel: 0507 593 18 66.
    //         Iptal: sitemizdeki Randevularim bolumu"
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCreated(AppointmentCreatedEvent event) {
        String message = SmsText.fit(
                "Randevunuz onaylandi: " + event.startTime().format(DATE_TIME) + ", " + SmsText.ascii(event.serviceName()),
                " - " + SmsText.ascii(event.employeeName()),
                businessNamePart(),
                businessPhone.isBlank() ? null : " Tel: " + SmsText.ascii(businessPhone),
                ". Iptal: sitemizdeki Randevularim bolumu");
        send(event.customerPhone(), message, "Onay");
    }

    // İptal kaydedildikten sonra arka planda çalışır; SMS hatası iptali geri almaz, sadece loglanır
    // Örnek: "Randevunuz iptal edildi: 14.10.2026 15:30, Sac Kesimi - Emin Ak. Arif Tuzunalp
    //         Bilgi ve yeni randevu: 0507 593 18 66"
    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCancelledByAdmin(AppointmentCancelledByAdminEvent event) {
        String message = SmsText.fit(
                "Randevunuz iptal edildi: " + event.startTime().format(DATE_TIME) + ", " + SmsText.ascii(event.serviceName()),
                " - " + SmsText.ascii(event.employeeName()),
                businessNamePart(),
                businessPhone.isBlank() ? null : " Bilgi ve yeni randevu: " + SmsText.ascii(businessPhone));
        send(event.customerPhone(), message, "İptal");
    }

    private String businessNamePart() {
        return businessName.isBlank() ? "." : ". " + SmsText.ascii(businessName);
    }

    private void send(String phone, String message, String type) {
        try {
            smsSender.sendNotification(PhoneUtils.toInternational(phone), message);
        } catch (RuntimeException e) {
            log.error("{} SMS'i gönderilemedi ({}): {}", type, phone, e.getMessage());
        }
    }
}
