package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.PhoneVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PhoneVerificationRepository extends JpaRepository<PhoneVerification, UUID> {

    Optional<PhoneVerification> findFirstByPhoneOrderByCreatedAtDesc(String phone);

    long countByPhoneAndCreatedAtAfter(String phone, LocalDateTime after);

    // Süresi 1 saatten eski kodlar saatlik limit için de gerekmez, silinebilir
    @Modifying
    @Query("DELETE FROM PhoneVerification v WHERE v.createdAt < :before")
    void deleteCreatedBefore(LocalDateTime before);
}
