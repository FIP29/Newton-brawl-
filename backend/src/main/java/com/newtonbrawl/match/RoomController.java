package com.newtonbrawl.match;

import com.newtonbrawl.match.dto.RoomDto;
import com.newtonbrawl.security.AuthenticatedPlayer;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Private rooms: create one, share the code, both players connect to {@code /ws/match?room=CODE}. */
@RestController
@RequestMapping("/api/rooms")
public class RoomController {

    private final RoomService rooms;

    public RoomController(RoomService rooms) {
        this.rooms = rooms;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RoomDto create(@AuthenticationPrincipal AuthenticatedPlayer me) {
        return rooms.create(me.id());
    }

    /** Lets the client validate a code before navigating to the fight screen. */
    @GetMapping("/{code}")
    public RoomDto get(@PathVariable String code) {
        return rooms.get(code);
    }
}
