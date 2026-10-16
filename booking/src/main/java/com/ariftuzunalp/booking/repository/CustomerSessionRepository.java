package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.CustomerSession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CustomerSessionRepository extends JpaRepository<CustomerSession, UUID> {

    Optional<CustomerSession> findByTokenHash(String tokenHash);

    @Modifying
    @Query("DELETE FROM CustomerSession s WHERE s.expiresAt < :now")
    void deleteExpired(LocalDateTime now);
}
