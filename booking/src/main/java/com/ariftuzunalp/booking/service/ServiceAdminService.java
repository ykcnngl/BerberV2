package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.dto.AdminServiceResponse;
import com.ariftuzunalp.booking.dto.ServiceRequest;
import com.ariftuzunalp.booking.entity.Employee;
import com.ariftuzunalp.booking.entity.Service;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.exception.NotFoundException;
import com.ariftuzunalp.booking.repository.EmployeeRepository;
import com.ariftuzunalp.booking.repository.ServiceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.text.Collator;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

// Yönetici paneli: hizmet ekleme/düzenleme ve hizmeti verecek ekip üyelerinin atanması
@org.springframework.stereotype.Service
@RequiredArgsConstructor
public class ServiceAdminService {

    public static final Comparator<Service> BY_NAME =
            Comparator.comparing(Service::getName, Collator.getInstance(Locale.forLanguageTag("tr-TR")));

    private final ServiceRepository serviceRepository;
    private final EmployeeRepository employeeRepository;

    @Transactional(readOnly = true)
    public List<AdminServiceResponse> listServices() {
        return serviceRepository.findAll().stream()
                .sorted(Comparator.comparing(Service::isActive).reversed().thenComparing(BY_NAME))
                .map(AdminServiceResponse::from)
                .toList();
    }

    @Transactional
    public AdminServiceResponse createService(ServiceRequest request) {
        Service service = Service.builder().isActive(true).build();
        apply(service, request);
        return AdminServiceResponse.from(serviceRepository.save(service));
    }

    @Transactional
    public AdminServiceResponse updateService(UUID id, ServiceRequest request) {
        Service service = findService(id);
        apply(service, request);
        return AdminServiceResponse.from(service);
    }

    // Hizmet silinmez, pasife alınır: geçmiş randevular korunur, yeni randevu alınamaz
    @Transactional
    public AdminServiceResponse setActive(UUID id, boolean active) {
        Service service = findService(id);
        service.setActive(active);
        return AdminServiceResponse.from(service);
    }

    // Hizmeti verecek ekip üyelerini belirler: listedekilere eklenir, diğerlerinden çıkarılır
    @Transactional
    public void setProviders(UUID id, Collection<UUID> employeeIds) {
        Service service = findService(id);
        Set<UUID> wanted = employeeIds == null ? Set.of() : new HashSet<>(employeeIds);
        List<Employee> all = employeeRepository.findAll();
        if (all.stream().filter(e -> wanted.contains(e.getId())).count() != wanted.size()) {
            throw new NotFoundException("Seçilen ekip üyelerinden biri bulunamadı.");
        }
        for (Employee employee : all) {
            if (employee.getServices() == null) {
                employee.setServices(new HashSet<>());
            }
            boolean provides = employee.getServices().stream().anyMatch(s -> s.getId().equals(id));
            if (wanted.contains(employee.getId()) && !provides) {
                employee.getServices().add(service);
            } else if (!wanted.contains(employee.getId()) && provides) {
                employee.getServices().removeIf(s -> s.getId().equals(id));
            }
        }
    }

    private void apply(Service service, ServiceRequest request) {
        String name = request.getName() == null ? "" : request.getName().trim();
        if (name.isEmpty()) {
            throw new BusinessException("Hizmet adı zorunludur.");
        }
        if (request.getDurationMinutes() == null || request.getDurationMinutes() < 5
                || request.getDurationMinutes() > 600) {
            throw new BusinessException("Süre 5 ile 600 dakika arasında olmalıdır.");
        }
        if (request.getPrice() == null || request.getPrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("Geçerli bir fiyat girin.");
        }
        boolean duplicate = serviceRepository.findAll().stream()
                .anyMatch(s -> !s.getId().equals(service.getId()) && s.getName().equalsIgnoreCase(name));
        if (duplicate) {
            throw new BusinessException("Bu isimde bir hizmet zaten var.");
        }
        service.setName(name);
        service.setDurationMinutes(request.getDurationMinutes());
        service.setPrice(request.getPrice());
    }

    private Service findService(UUID id) {
        return serviceRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Hizmet bulunamadı."));
    }
}
