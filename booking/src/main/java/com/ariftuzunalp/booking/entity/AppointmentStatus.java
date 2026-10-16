package com.ariftuzunalp.booking.entity;

public enum AppointmentStatus {
    PENDING,
    CONFIRMED,
    CANCELLED,
    COMPLETED,
    NO_SHOW // Müşteri gelmedi: yönetici işaretler, ciroya sayılmaz
}