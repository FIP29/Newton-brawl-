package com.newtonbrawl.codex;

import com.newtonbrawl.security.AuthenticatedPlayer;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/codex")
public class CodexController {

    private final CodexService codex;

    public CodexController(CodexService codex) {
        this.codex = codex;
    }

    /** All pages, with text only for entries this player has unlocked. */
    @GetMapping
    public CodexDtos.Codex mine(@AuthenticationPrincipal AuthenticatedPlayer me) {
        return codex.codexFor(me.id());
    }

    /** A Lab Note for one move (shown after local matches, which aren't recorded on the server). */
    @GetMapping("/lab-note")
    public CodexDtos.LabNote labNote(@RequestParam String fighter, @RequestParam String move) {
        return codex.labNote(fighter, move);
    }
}
