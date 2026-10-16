package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.util.UUID;

@Entity
@Table(name = "customers")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String fullName;
    
    @Column(unique = true, nullable = false)
    private String phone;
    
    @Column(columnDefinition = "TEXT")
    private String notes; // VIP notlar: "Saçını 3 numara kestirir"
    
    @Builder.Default
    private boolean isBlacklisted = false;
}