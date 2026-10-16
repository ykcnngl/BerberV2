package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.EmployeeBreak;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface EmployeeBreakRepository extends JpaRepository<EmployeeBreak, UUID> {

    // Çalışanın o gün geçerli olan molaları: o tarihe özel + haftanın o günü + her gün
    @Query("""
            SELECT b FROM EmployeeBreak b
            WHERE b.employee.id = :employeeId
              AND (b.breakDate = :date
                   OR (b.breakDate IS NULL AND (b.dayOfWeek IS NULL OR b.dayOfWeek = :dayOfWeek)))
            """)
    List<EmployeeBreak> findApplicable(UUID employeeId, LocalDate date, DayOfWeek dayOfWeek);

    // Yönetici listesi: tekrarlayan molalar + bugünden sonraki tarihli molalar
    @Query("""
            SELECT b FROM EmployeeBreak b
            WHERE b.employee.id = :employeeId AND (b.breakDate IS NULL OR b.breakDate >= :today)
            ORDER BY b.breakDate NULLS FIRST, b.dayOfWeek NULLS FIRST, b.startTime
            """)
    List<EmployeeBreak> findCurrent(UUID employeeId, LocalDate today);
}
