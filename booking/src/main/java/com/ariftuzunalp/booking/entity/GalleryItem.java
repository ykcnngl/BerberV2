package com.ariftuzunalp.booking.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.UUID;

// Sitedeki "Çalışmalarımız" galerisindeki bir fotoğraf (dosya diskte, burada sadece adı tutulur)
@Entity
@Table(name = "gallery_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GalleryItem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String fileName;

    private String caption;

    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
