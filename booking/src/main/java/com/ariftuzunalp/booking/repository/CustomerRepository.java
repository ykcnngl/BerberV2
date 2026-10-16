package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.Customer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, UUID> {
    
    // Telefon numarasına göre müşteriyi bulan metot
    Optional<Customer> findByPhone(String phone);
}