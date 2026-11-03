package com.newtonbrawl;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Entry point for the NEWTON BRAWL backend.
 *
 * <p>Layering: {@code controller -> service -> repository}, with DTOs at the HTTP boundary.
 * The real-time match engine lives in {@link com.newtonbrawl.engine} and is deliberately
 * independent of Spring so it can be unit-tested and run on its own threads.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class NewtonBrawlApplication {
    public static void main(String[] args) {
        SpringApplication.run(NewtonBrawlApplication.class, args);
    }
}
