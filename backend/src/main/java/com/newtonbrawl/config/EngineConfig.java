package com.newtonbrawl.config;

import com.newtonbrawl.engine.fighter.FighterCatalog;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Exposes the (Spring-free) engine pieces as beans. */
@Configuration
@EnableScheduling
public class EngineConfig {

    /** Loaded once at startup; fails fast if any fighter JSON is invalid. */
    @Bean
    FighterCatalog fighterCatalog() {
        return FighterCatalog.loadFromClasspath();
    }
}
