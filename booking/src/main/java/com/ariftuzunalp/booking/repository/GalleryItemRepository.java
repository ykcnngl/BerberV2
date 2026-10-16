package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.GalleryItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface GalleryItemRepository extends JpaRepository<GalleryItem, UUID> {
    List<GalleryItem> findAllByOrderByCreatedAtDesc();
}
