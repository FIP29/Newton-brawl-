package com.newtonbrawl.match.dto;

import com.newtonbrawl.match.RoomStatus;

public record RoomDto(String code, RoomStatus status, int playerCount) {}
