package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "employee_breaks")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmployeeBreak {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    // Molanın geçerli olduğu günler:
    // breakDate dolu -> sadece o tarih; dayOfWeek dolu -> her hafta o gün; ikisi de boş -> her gün
    private LocalDate breakDate;

    @Enumerated(EnumType.STRING)
    private DayOfWeek dayOfWeek;

    private LocalTime startTime;
    private LocalTime endTime;
    private String reason; // "Öğle Yemeği", "İzin"
}