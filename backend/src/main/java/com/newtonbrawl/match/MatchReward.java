package com.newtonbrawl.match;

import com.newtonbrawl.codex.CodexDtos;
import com.newtonbrawl.history.MatchMode;
import com.newtonbrawl.unlock.UnlockDtos;

import java.util.List;

/** What one player earned from a match; shown on the victory screen. */
public record MatchReward(MatchMode mode, int eloBefore, int eloAfter, String tierBefore, String tierAfter,
                          String tierNameAfter, List<CodexDtos.EntryRef> newCodex,
                          List<UnlockDtos.UnlockRef> newUnlocks, CodexDtos.LabNote labNote) {}
