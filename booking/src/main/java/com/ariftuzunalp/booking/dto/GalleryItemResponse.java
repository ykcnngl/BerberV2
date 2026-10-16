package com.ariftuzunalp.booking.dto;

import com.ariftuzunalp.booking.entity.GalleryItem;

import java.time.LocalDateTime;
import java.util.UUID;

// imagePath API adresine eklenerek kullanılır: {API_URL}{imagePath}
public record GalleryItemResponse(UUID id, String imagePath, String caption, LocalDateTime createdAt) {
    public static GalleryItemResponse from(GalleryItem item) {
        return new GalleryItemResponse(item.getId(), "/gallery/images/" + item.getFileName(),
                item.getCaption(), item.getCreatedAt());
    }
}
