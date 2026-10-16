package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.Appointment;
import com.ariftuzunalp.booking.entity.AppointmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface AppointmentRepository extends JpaRepository<Appointment, UUID> {
    
    List<Appointment> findByEmployeeIdAndStartTimeBetweenOrderByStartTimeAsc(UUID employeeId, LocalDateTime start, LocalDateTime end);

    // Müşterinin belirli bir tarihten sonraki randevularını yeniden eskiye doğru getir
    List<Appointment> findByCustomerPhoneAndStartTimeGreaterThanEqualOrderByStartTimeDesc(String phone,
                                                                                         LocalDateTime from);

    // Ciro raporu: aralıktaki iptal edilmemiş randevular, çalışan ve hizmetiyle birlikte
    @Query("""
            select a from Appointment a join fetch a.employee join fetch a.service
            where a.startTime >= :from and a.startTime < :to and a.status <> :excluded
            """)
    List<Appointment> findForReport(LocalDateTime from, LocalDateTime to, AppointmentStatus excluded);

    // İzin eklerken çakışan (iptal edilmemiş) randevu sayısı
    long countByEmployeeIdAndStatusNotAndStartTimeBetween(UUID employeeId, AppointmentStatus status,
                                                          LocalDateTime start, LocalDateTime end);
}
