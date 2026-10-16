package com.ariftuzunalp.booking.controller;

import com.ariftuzunalp.booking.dto.GalleryItemResponse;
import com.ariftuzunalp.booking.service.GalleryService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.UUID;

// Fotoğraf dosyaları /api/v1/booking/gallery/images/** adresinden sunulur (bkz. WebConfig).
// /admin altındaki uç noktalar AdminAuthInterceptor ile korunur.
@RestController
@RequestMapping("/api/v1/booking")
@RequiredArgsConstructor
public class GalleryController {

    private final GalleryService galleryService;

    @GetMapping("/gallery")
    public ResponseEntity<List<GalleryItemResponse>> list() {
        return ResponseEntity.ok(galleryService.list());
    }

    @PostMapping("/admin/gallery")
    public ResponseEntity<GalleryItemResponse> upload(@RequestParam("file") MultipartFile file,
                                                      @RequestParam(value = "caption", required = false) String caption) {
        return ResponseEntity.ok(galleryService.upload(file, caption));
    }

    @DeleteMapping("/admin/gallery/{id}")
    public ResponseEntity<Map<String, String>> delete(@PathVariable UUID id) {
        galleryService.delete(id);
        return ResponseEntity.ok(Map.of("message", "Fotoğraf silindi."));
    }
}
