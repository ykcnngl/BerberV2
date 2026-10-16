package com.ariftuzunalp.booking.repository;

import com.ariftuzunalp.booking.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface EmployeeRepository extends JpaRepository<Employee, UUID> {
    
    // Pessimistic Write kilidi ile ekip üyesini getirir
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Employee e WHERE e.id = :id")
    Optional<Employee> findByIdForUpdate(UUID id);
}