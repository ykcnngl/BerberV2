package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.EmployeeLeave;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface EmployeeLeaveRepository extends JpaRepository<EmployeeLeave, UUID> {

    // Verilen tarih bir izin aralığının içinde mi?
    boolean existsByEmployeeIdAndStartDateLessThanEqualAndEndDateGreaterThanEqual(
            UUID employeeId, LocalDate date, LocalDate sameDate);

    // Yönetici listesi: bitmemiş izinler
    List<EmployeeLeave> findByEmployeeIdAndEndDateGreaterThanEqualOrderByStartDateAsc(UUID employeeId, LocalDate today);
}
