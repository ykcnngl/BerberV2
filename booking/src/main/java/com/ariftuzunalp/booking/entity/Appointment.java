package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "appointments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Appointment {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id", nullable = false)
    private Service service;

    private LocalDateTime startTime;
    private LocalDateTime endTime; // startTime + duration + buffer

    // Randevu alındığı andaki hizmet fiyatı: sonradan fiyat değişse de ciro raporu bozulmaz
    private BigDecimal price;
    
    @Enumerated(EnumType.STRING)
    private AppointmentStatus status; // PENDING, CONFIRMED, CANCELLED, COMPLETED, NO_SHOW
    
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}