package com.ariftuzunalp.booking.config;

import com.ariftuzunalp.booking.entity.Customer;
import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.entity.Role;
import com.ariftuzunalp.booking.entity.Service;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.repository.CustomerRepository;
import com.ariftuzunalp.booking.repository.EmployeeRepository;
import com.ariftuzunalp.booking.repository.ServiceRepository;
import com.ariftuzunalp.booking.util.PhoneUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final EmployeeRepository employeeRepository;
    private final ServiceRepository serviceRepository;
    private final CustomerRepository customerRepository;
    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(String... args) throws Exception {

        dropAppointmentStatusCheck();
        normalizeCustomerPhones();
        
        // Veritabanı boşsa test verilerini ekle
        if (employeeRepository.count() == 0 && serviceRepository.count() == 0) {
            
            // 1. Hizmeti Oluştur ve Kaydet
            Service vipHaircut = Service.builder()
                    .name("VIP Saç Kesimi")
                    .durationMinutes(60)
                    .bufferMinutes(10) // 10 dakika temizlik süresi
                    .price(new BigDecimal("500.00"))
                    .isActive(true)
                    .build();
            
            serviceRepository.save(vipHaircut);

            // 2. Ekip üyesini oluştur ve kaydet
            Employee emin = Employee.builder()
                    .firstName("Emin")
                    .lastName("Ak")
                    .phone("0555 444 3322")
                    .role(Role.ADMIN)
                    .isActive(true)
                    .services(Set.of(vipHaircut)) // Çoka çok ilişki bağlantısı
                    .build();
            
            employeeRepository.save(emin);

            System.out.println("======================================================");
            System.out.println("✅ TEST VERİLERİ VERİTABANINA EKLENDİ!");
            System.out.println("👉 Emin Ak ID: " + emin.getId());
            System.out.println("👉 VIP Saç Kesimi ID: " + vipHaircut.getId());
            System.out.println("======================================================");
        }

        addDefaultServices();
    }

    // Sitedeki "Neler yapıyoruz" bölümündeki hizmetler (ad -> süre dk). Süre ve hizmeti
    // hangi ekip üyesinin vereceği yönetici panelinden belirlenir.
    private static final Map<String, Integer> DEFAULT_SERVICES = new LinkedHashMap<>();
    static {
        DEFAULT_SERVICES.put("Saç Kesimi", 30);
        DEFAULT_SERVICES.put("Sakal Tasarımı", 30);
        DEFAULT_SERVICES.put("Cilt Bakımı", 60);
        DEFAULT_SERVICES.put("Ölçülü Kaş Alımı", 15);
        DEFAULT_SERVICES.put("Manikür & Pedikür", 60);
    }

    // Sadece bir kez çalışır: listedeki hizmetlerden hiçbiri yoksa hepsini ekler
    // (yönetici sonradan birini yeniden adlandırırsa tekrar eklenmez)
    private void addDefaultServices() {
        boolean anyExists = serviceRepository.findAll().stream()
                .anyMatch(s -> DEFAULT_SERVICES.containsKey(s.getName()));
        if (anyExists) {
            return;
        }
        DEFAULT_SERVICES.forEach((name, minutes) -> serviceRepository.save(Service.builder()
                .name(name)
                .durationMinutes(minutes)
                .isActive(true)
                .build()));
        System.out.println("✅ Varsayılan hizmetler eklendi. Ekip atamalarını yönetici panelinden yapın.");
    }

    // Hibernate tabloyu oluştururken durum sütununa o anki enum değerleriyle CHECK kısıtı koyar ve
    // ddl-auto=update bunu güncellemez; kaldırılmazsa yeni eklenen NO_SHOW kaydedilemez
    private void dropAppointmentStatusCheck() {
        jdbcTemplate.execute("ALTER TABLE IF EXISTS appointments DROP CONSTRAINT IF EXISTS appointments_status_check");
    }

    // Eski kayıtlardaki "05554443322" gibi numaraları standart "0555 444 3322" formatına çevirir
    private void normalizeCustomerPhones() {
        for (Customer customer : customerRepository.findAll()) {
            String original = customer.getPhone();
            String normalized;
            try {
                normalized = PhoneUtils.normalize(original);
            } catch (BusinessException e) {
                System.out.println("⚠️ Geçersiz telefon numarası atlandı: " + original);
                continue;
            }
            if (normalized.equals(original)) {
                continue;
            }
            if (customerRepository.findByPhone(normalized).isPresent()) {
                System.out.println("⚠️ " + original + " numarası " + normalized + " ile çakışıyor, elle birleştirilmeli.");
                continue;
            }
            customer.setPhone(normalized);
            customerRepository.save(customer);
        }
    }
}
