package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "services")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Service {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name; // Örn: VIP Cilt Bakımı
    private int durationMinutes; // Örn: 60
    
    @Builder.Default
    private int bufferMinutes = 10; // 10 dakika temizlik/tampon süresi
    
    private BigDecimal price;
    @Builder.Default
    private boolean isActive = true;
}