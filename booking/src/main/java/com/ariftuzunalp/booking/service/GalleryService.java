package com.ariftuzunalp.booking.service;

import com.ariftuzunalp.booking.dto.GalleryItemResponse;
import com.ariftuzunalp.booking.entity.GalleryItem;
import com.ariftuzunalp.booking.exception.BusinessException;
import com.ariftuzunalp.booking.exception.NotFoundException;
import com.ariftuzunalp.booking.repository.GalleryItemRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.List;
import java.util.Set;
import java.util.UUID;

// Galeri fotoğrafları: yüklenen dosya gerçekten resim mi kontrol edilir, küçültülür ve
// yeniden JPEG olarak kaydedilir (telefonun konum/EXIF bilgileri bu sırada silinir).
@org.springframework.stereotype.Service
public class GalleryService {

    private static final Logger log = LoggerFactory.getLogger(GalleryService.class);
    private static final Set<String> ALLOWED_FORMATS = Set.of("jpeg", "png");
    private static final long MAX_PIXELS = 50_000_000L; // dev boyutlu "resim bombası"na karşı
    private static final int MAX_EDGE = 1600;
    private static final int MAX_CAPTION = 120;

    private final GalleryItemRepository repository;
    private final Path galleryDir;

    public GalleryService(GalleryItemRepository repository, @Value("${app.uploads.dir}") String uploadsDir) {
        this.repository = repository;
        this.galleryDir = Path.of(uploadsDir, "gallery").toAbsolutePath().normalize();
        ImageIO.setUseCache(false); // geçici dosya yerine bellek kullan
        try {
            Files.createDirectories(galleryDir);
        } catch (IOException e) {
            throw new UncheckedIOException("Galeri klasörü oluşturulamadı: " + galleryDir, e);
        }
        log.info("Galeri fotoğrafları klasörü: {}", galleryDir);
    }

    public Path getGalleryDir() {
        return galleryDir;
    }

    @Transactional(readOnly = true)
    public List<GalleryItemResponse> list() {
        return repository.findAllByOrderByCreatedAtDesc().stream().map(GalleryItemResponse::from).toList();
    }

    @Transactional
    public GalleryItemResponse upload(MultipartFile file, String caption) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("Lütfen bir fotoğraf seçin.");
        }
        String cleanCaption = caption == null ? null : caption.strip();
        if (cleanCaption != null && cleanCaption.length() > MAX_CAPTION) {
            throw new BusinessException("Açıklama en fazla " + MAX_CAPTION + " karakter olabilir.");
        }

        BufferedImage image = readImage(file);
        String fileName = UUID.randomUUID() + ".jpg";
        Path target = galleryDir.resolve(fileName);
        writeJpeg(toRgb(scaleDown(image)), target);

        GalleryItem saved = repository.save(GalleryItem.builder()
                .fileName(fileName)
                .caption(cleanCaption == null || cleanCaption.isEmpty() ? null : cleanCaption)
                .build());
        return GalleryItemResponse.from(saved);
    }

    @Transactional
    public void delete(UUID id) {
        GalleryItem item = repository.findById(id)
                .orElseThrow(() -> new NotFoundException("Fotoğraf bulunamadı."));
        repository.delete(item);
        try {
            Files.deleteIfExists(galleryDir.resolve(item.getFileName()));
        } catch (IOException e) {
            log.warn("Galeri dosyası silinemedi: {}", item.getFileName(), e);
        }
    }

    // Önce sadece başlık okunur (boyut kontrolü), sonra resim çözülür
    private BufferedImage readImage(MultipartFile file) {
        try (InputStream in = file.getInputStream(); ImageInputStream iis = ImageIO.createImageInputStream(in)) {
            Iterator<ImageReader> readers = iis == null ? null : ImageIO.getImageReaders(iis);
            if (readers == null || !readers.hasNext()) {
                throw new BusinessException("Sadece JPEG veya PNG fotoğraf yüklenebilir.");
            }
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase();
                if (!ALLOWED_FORMATS.contains(format)) {
                    throw new BusinessException("Sadece JPEG veya PNG fotoğraf yüklenebilir.");
                }
                reader.setInput(iis, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels > MAX_PIXELS) {
                    throw new BusinessException("Fotoğrafın çözünürlüğü çok yüksek.");
                }
                return reader.read(0);
            } finally {
                reader.dispose();
            }
        } catch (IOException e) {
            throw new BusinessException("Fotoğraf okunamadı. Lütfen farklı bir dosya deneyin.");
        }
    }

    private static BufferedImage scaleDown(BufferedImage src) {
        int longEdge = Math.max(src.getWidth(), src.getHeight());
        if (longEdge <= MAX_EDGE) {
            return src;
        }
        double ratio = (double) MAX_EDGE / longEdge;
        int w = (int) Math.round(src.getWidth() * ratio);
        int h = (int) Math.round(src.getHeight() * ratio);
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, w, h);
        g.drawImage(src, 0, 0, w, h, null);
        g.dispose();
        return out;
    }

    // JPEG şeffaflık desteklemez: PNG'deki şeffaf alanlar beyaz yapılır
    private static BufferedImage toRgb(BufferedImage src) {
        if (src.getType() == BufferedImage.TYPE_INT_RGB) {
            return src;
        }
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, src.getWidth(), src.getHeight());
        g.drawImage(src, 0, 0, null);
        g.dispose();
        return out;
    }

    private static void writeJpeg(BufferedImage image, Path target) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam param = writer.getDefaultWriteParam();
        param.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        param.setCompressionQuality(0.85f);
        // ImageOutputStream kapanınca alttaki dosya akışını kapatmaz; ikisi ayrı ayrı kapatılmalı
        try (OutputStream file = Files.newOutputStream(target);
             ImageOutputStream out = ImageIO.createImageOutputStream(file)) {
            writer.setOutput(out);
            writer.write(null, new IIOImage(image, null, null), param);
        } catch (IOException e) {
            throw new UncheckedIOException("Fotoğraf kaydedilemedi", e);
        } finally {
            writer.dispose();
        }
    }
}
