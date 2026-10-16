package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.DayOfWeek;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "employees")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Employee {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String firstName;
    private String lastName;
    private String phone;
    
    @Enumerated(EnumType.STRING)
    private Role role; // ADMIN, STAFF
    
    @Builder.Default
    private boolean isActive = true;

    // Bir çalışanın birden fazla uzmanlık alanı (hizmeti) olabilir
    @ManyToMany
    @JoinTable(
        name = "employee_services",
        joinColumns = @JoinColumn(name = "employee_id"),
        inverseJoinColumns = @JoinColumn(name = "service_id")
    )
    private Set<Service> services;

    // Her hafta çalışmadığı günler (örn. her pazartesi)
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "employee_weekly_off_days", joinColumns = @JoinColumn(name = "employee_id"))
    @Column(name = "day_of_week")
    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Set<DayOfWeek> weeklyOffDays = new HashSet<>();
}