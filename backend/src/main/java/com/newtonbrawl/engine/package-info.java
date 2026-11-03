/**
 * The server-authoritative match engine (Phase 2+).
 *
 * <p>This package must stay free of Spring/JPA imports: it simulates fighters at 60 ticks/sec,
 * consumes player inputs and produces compact state snapshots. The WebSocket layer adapts it
 * to the network; the persistence layer records results once a match ends.
 */
package com.newtonbrawl.engine;
