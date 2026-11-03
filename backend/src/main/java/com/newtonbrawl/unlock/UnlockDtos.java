package com.newtonbrawl.unlock;

public final class UnlockDtos {
    private UnlockDtos() {}

    /**
     * @param available whether the content exists in this build yet (future fighters arrive in later phases)
     */
    public record UnlockStatus(String id, UnlockCatalog.Type type, String fighter, String skin, String name,
                               String requirement, int progress, int target, boolean unlocked, boolean available) {}

    public record UnlockRef(String id, String name, UnlockCatalog.Type type, String fighter, String skin, boolean available) {}
}
