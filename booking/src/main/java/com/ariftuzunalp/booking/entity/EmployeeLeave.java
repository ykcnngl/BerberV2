package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDate;
import java.util.UUID;

// Çalışanın tam gün izinli olduğu tarih aralığı (başlangıç ve bitiş dahil)
@Entity
@Table(name = "employee_leaves")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmployeeLeave {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate endDate;

    private String reason; // "Yıllık izin", "Rapor"
}
