package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

// Telefona gönderilen tek kullanımlık doğrulama kodu (kodun kendisi değil, özeti saklanır)
@Entity
@Table(name = "phone_verifications", indexes = @Index(columnList = "phone"))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PhoneVerification {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private String codeHash;

    @Column(nullable = false)
    private LocalDateTime expiresAt;

    @Builder.Default
    private int attempts = 0;

    @Builder.Default
    private boolean used = false;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
