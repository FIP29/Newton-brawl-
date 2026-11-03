package com.newtonbrawl.matchmaking;

import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.security.AuthenticatedPlayer;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code POST /api/matchmaking/{casual|ranked}} → ticket;
 * {@code GET /api/matchmaking/tickets/{id}} → status (poll ~1 s; carries the room code once matched);
 * {@code DELETE /api/matchmaking/tickets/{id}} → leave the queue.
 */
@RestController
@RequestMapping("/api/matchmaking")
public class MatchmakingController {

    private final MatchmakingService matchmaking;

    public MatchmakingController(MatchmakingService matchmaking) {
        this.matchmaking = matchmaking;
    }

    @PostMapping("/{mode}")
    @ResponseStatus(HttpStatus.CREATED)
    public MatchmakingService.TicketStatus join(@AuthenticationPrincipal AuthenticatedPlayer me, @PathVariable String mode) {
        MatchMode m = switch (mode.toLowerCase(java.util.Locale.ROOT)) {
            case "casual" -> MatchMode.CASUAL;
            case "ranked" -> MatchMode.RANKED;
            default -> throw new com.newtonbrawl.common.exception.NotFoundException("Unknown queue: " + mode);
        };
        return matchmaking.join(me.id(), m);
    }

    @GetMapping("/tickets/{id}")
    public MatchmakingService.TicketStatus poll(@AuthenticationPrincipal AuthenticatedPlayer me, @PathVariable String id) {
        return matchmaking.poll(id, me.id());
    }

    @DeleteMapping("/tickets/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@AuthenticationPrincipal AuthenticatedPlayer me, @PathVariable String id) {
        matchmaking.cancel(id, me.id());
    }
}
