package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

// Kodu doğrulayan müşteriye verilen kısa süreli oturum anahtarı (anahtarın özeti saklanır)
@Entity
@Table(name = "customer_sessions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CustomerSession {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String tokenHash;

    @Column(nullable = false)
    private String phone;

    @Column(nullable = false)
    private LocalDateTime expiresAt;
}
