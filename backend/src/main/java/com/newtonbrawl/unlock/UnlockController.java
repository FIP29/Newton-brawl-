package com.newtonbrawl.unlock;

import com.newtonbrawl.security.AuthenticatedPlayer;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/unlocks")
public class UnlockController {

    private final UnlockService unlocks;

    public UnlockController(UnlockService unlocks) {
        this.unlocks = unlocks;
    }

    /** Every unlockable with progress toward it. */
    @GetMapping
    public List<UnlockDtos.UnlockStatus> mine(@AuthenticationPrincipal AuthenticatedPlayer me) {
        return unlocks.statusFor(me.id());
    }

    /** Fighter id → skins this player can pick right now. */
    @GetMapping("/usable")
    public Map<String, List<String>> usable(@AuthenticationPrincipal AuthenticatedPlayer me) {
        return unlocks.usable(me.id());
    }
}
