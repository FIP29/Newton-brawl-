package com.newtonbrawl.config;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * Production serves the built frontend from {@code classpath:/static} (the Docker image copies
 * {@code frontend/dist} there). The game is a single-page app, so its screens' URLs (opened
 * directly, refreshed or shared, like /fight/ABCD) must all return index.html.
 */
@Controller
public class SpaController {

    @GetMapping({"/login", "/play", "/local", "/codex", "/leaderboard", "/profile", "/fight/**", "/dev/**"})
    public String app() {
        return "forward:/index.html";
    }
}
